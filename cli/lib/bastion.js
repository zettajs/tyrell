// Copyright 2018 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

var fs = require('fs');
var path = require('path');
var async = require('async');
var utils = require('./aws-utils');

//var stackName = 'link-bastion';

var get = module.exports.get = function(AWS, stackName, cb) {
  var ec2 = new AWS.EC2();
  var cloudformation = new AWS.CloudFormation();

  cloudformation.describeStacks({ StackName: stackName }, function(err, stack) {
    if (err) {
      return cb(err);
    }
    stack = stack.Stacks[0];

    var params = {};
    stack.Parameters.forEach(function(p) {
      params[p.ParameterKey] = p.ParameterValue;
    });
    stack.Parameters = params;

    cloudformation.describeStackResources({ StackName: stackName }, function(err, data) {
      if (err) {
        return cb(err);
      }

      function getSgGroupId(sgName, cb) {
        ec2.describeSecurityGroups({ GroupNames: [sgName] }, function(err, data) {
          if (err) {
            return cb(err);
          }
          return cb(null, data.SecurityGroups[0].GroupId);
        });
      }
      async.map(data.StackResources, function(r, next) {
        if (r.ResourceType === 'AWS::EC2::SecurityGroup') {
          getSgGroupId(r.PhysicalResourceId, function(err, id) {
            if (err) {
              return next(err);
            }
            r.GroupId = id;
            next(null, r);
          });
        } else if (r.LogicalResourceId === 'BastionASG') {
          utils.getAutoScaleInstances(AWS, r.PhysicalResourceId, function(err, instances) {
            if (err) {
              return next(err);
            }

            if (instances.length > 0) {
              ec2.describeInstances({ InstanceIds: instances }, function(err, data) {
                if (err) {
                  return next(err);
                }

                var instances = [];
                data.Reservations.forEach(function(res) {
                  instances = instances.concat(res.Instances);
                });
                r.Instances = instances;
                next(null, r);
              });
            } else {
              r.Instances = [];
              next(null, r);
            }
          });

        } else {
          next(null, r);
        }
      }, function(err, result) {
        if (err) {
          return cb(err);
        }

        var resources = {};
        result.forEach(function(r) {
          resources[r.LogicalResourceId] = r;
        });

        var Outputs = {};
        stack.Outputs.forEach(function(key) {
          Outputs[key.OutputKey] = key.OutputValue;
        });
        stack.Outputs = Outputs;

        stack.etcdPeers = [];
        resources['BastionASG'].Instances.forEach(function(instance) {
          if (instance.PrivateIpAddress) {
            stack.etcdPeers.push(instance.PrivateIpAddress);
          }
        });

        stack.Resources = resources;
        cb(null, stack);
      });

    });
  });
};

var list = module.exports.list = function(AWS, cb) {
  var cloudformation = new AWS.CloudFormation();

  cloudformation.describeStacks({}, function(err, data) {
    if (err) {
      return cb(err);
    }
    var stacks = data.Stacks.filter(function(stack) {
      if (stack.StackStatus !== 'CREATE_COMPLETE') {
        return false;
      }

      return stack.StackName === stackName;
    }).map(function(s) {
      return s.StackName;
    });

    async.map(stacks, get.bind(null, AWS), cb);
  });
};

function generateStackParams(stackName, config) {
  var template = require('../../roles/bastion/bastion-server-cf.json');
  var userData = fs.readFileSync(path.join(__dirname, '../../roles/bastion/bastion-user-data')).toString();
  template.Resources['BastionLaunchConfig'].Properties.UserData = { 'Fn::Base64': userData };

  var params = {
    StackName: stackName,
    OnFailure: 'DELETE',
    //DisableRollback: true,
    Capabilities: ['CAPABILITY_IAM'],
    Parameters: [
      { ParameterKey: 'BastionAMI', ParameterValue: config.ami },
      { ParameterKey: 'BastionInstanceType', ParameterValue: config.instanceType },
      { ParameterKey: 'BastionSize', ParameterValue: '' + config.size },
      { ParameterKey: 'BastionSubnets', ParameterValue: config.subnets },
      { ParameterKey: 'BastionVpc', ParameterValue: config.vpc }
    ],
    Tags: [
      { Key: 'versions:tyrell', Value: require('../package.json').version }
    ],
    TemplateBody: JSON.stringify(template),
    TimeoutInMinutes: 5
  };

  return params;
}

var create = module.exports.create = function(AWS, stackName, config, done) {
  var cloudformation = new AWS.CloudFormation();

  var params = generateStackParams(stackName, config);

  function checkStackStatus(cb) {
    cloudformation.describeStacks({ StackName: stackName }, function(err, data) {
      if (err) {
        return cb(new Error(err.code + ' ' + err.message));
      }

      if (!data.Stacks[0]) {
        return cb(new Error('Stack does not exist'));
      }

      return cb(null, data.Stacks[0].StackStatus === 'CREATE_COMPLETE', data.Stacks[0]);
    });
  }

  cloudformation.createStack(params, function(err, data) {
    if (err) {
      return done(new Error(err.code + ' ' + err.message));
    }

    function check() {
      checkStackStatus(function(err, status, stack) {
        if (err) {
          return done(err);
        }
        if (!status) {
          return setTimeout(check, 1000);
        }
        done(null, stack);
      });
    }
    check();
  });

};

var remove = module.exports.remove = function(AWS, stackName, cb) {
  var cloudformation = new AWS.CloudFormation();


  async.parallel([
    function(next){
      next();
    }
  ], function(err) {
    if (err) {
      return cb(err);
    }
    cloudformation.deleteStack({ StackName: stackName }, cb);
  });
};

// list all ec2 instances for a stack. Includes routers and targets
var ec2List = module.exports.ec2List = function(AWS, name, cb) {
  get(AWS, name, function(err, stack) {
    if (err) {
      return cb(err);
    }

    return cb(null, stack.Resources.BastionASG.Instances);
  });
};

// updates the cf template with the latest output from tyrell
// May spin down core services instances depending on the changes of the template
var update = module.exports.update = function(AWS, name, configUpdates, cb) {
  get(AWS, name, function(err, stack) {
    if (err) {
      return cb(err);
    }

    // need discoveryUrl for user-data update
    var config = {
      stack: name,
      discoveryUrl: stack.Parameters.DiscoveryUrl
    };

    Object.keys(configUpdates).forEach(function(k) {
      config[k] = configUpdates[k];
    });

    var params = generateStackParams(config);
    params.Parameters.forEach(function(v) {
      if (v.ParameterValue === undefined || v.ParameterValue === 'undefined') {
        delete v.ParameterValue;
        v.UsePreviousValue = true;
      }
    });

    params.UsePreviousTemplate = false;
    delete params.Tags;
    delete params.TimeoutInMinutes;
    delete params.OnFailure;

    var cloudformation = new AWS.CloudFormation();
    cloudformation.updateStack(params, cb);
  });
};
