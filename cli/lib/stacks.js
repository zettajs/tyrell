var fs = require('fs');
var async = require('async');
var targets = require('./targets');
var routers = require('./routers');
var workers = require('./workers');
var utils = require('./aws-utils');

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
        } else if (r.LogicalResourceId === 'CoreServicesASG') {
          utils.getAutoScaleInstances(AWS, r.PhysicalResourceId, function(err, instances) {
            if (err) {
              return next(err);
            }
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

        stack.etcdPeers = [];
        resources['CoreServicesASG'].Instances.forEach(function(instance) {
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

      return stack.Tags.some(function(tag) {
        return tag.Key === 'zetta:stack:main';
      });
    }).map(function(s) {
      return s.StackName;
    });

    async.map(stacks, get.bind(null, AWS), cb);
  });
};

function generateStackParams(config) {
  var template = require('../../aws/initial-stack-cf.json');
  var userData = fs.readFileSync('../aws/core-services.template').toString().replace('@@ETCD_DISCOVERY_URL@@', config.discoveryUrl);
  template.Resources['CoreServicesLaunchConfig'].Properties.UserData = { 'Fn::Base64': userData };

  var stackName = config.stack;
  var params = {
    StackName: stackName,
    OnFailure: 'DELETE',
    Capabilities: ['CAPABILITY_IAM'],
    Parameters: [
      { ParameterKey: 'DiscoveryUrl', ParameterValue: config.discoveryUrl },
      { ParameterKey: 'KeyPair', ParameterValue: config.keyPair },
      { ParameterKey: 'LogentriesToken', ParameterValue: config.logentriesToken },
      { ParameterKey: 'ZettaStack', ParameterValue: config.stack },
      { ParameterKey: 'CoreServicesAMI', ParameterValue: config.ami },
      { ParameterKey: 'CoreServicesInstanceType', ParameterValue: config.instanceType },
      { ParameterKey: 'CoreServicesSize', ParameterValue: '' + config.size }
    ],
    Tags: [
      { Key: 'zetta:stack', Value: stackName },
      { Key: 'zetta:stack:main', Value: 'true' }
    ],
    TemplateBody: JSON.stringify(template),
    TimeoutInMinutes: 5
  };

  return params;
}

var create = module.exports.create = function(AWS, config, done) {
  var cloudformation = new AWS.CloudFormation();

  var stackName = config.stack;
  var params = generateStackParams(config);

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

var remove = module.exports.remove = function(AWS, name, cb) {
  var cloudformation = new AWS.CloudFormation();


  async.parallel([
    function(next){
      targets.list(AWS, name, function(err, results) {
        if (err) {
          return next(err);
        }
        
        async.each(results, function(version, next) {
          targets.remove(AWS, version.StackName, next);
        }, next);
      });
    },
    function(next){
      routers.list(AWS, name, function(err, results) {
        if (err) {
          return next(err);
        }
        
        async.each(results, function(version, next) {
          routers.remove(AWS, version.StackName, next);
        }, next);
      });
    },
    function(next){
      workers.list(AWS, name, function(err, results) {
        if (err) {
          return next(err);
        }
        
        async.each(results, function(version, next) {
          workers.remove(AWS, version.StackName, next);
        }, next);
      });
    }
  ], function(err) {
    if (err) {
      return cb(err);
    }
    cloudformation.deleteStack({ StackName: name }, cb);
  });
};

// list all ec2 instances for a stack. Includes routers and targets
var ec2List = module.exports.ec2List = function(AWS, name, cb) {
  get(AWS, name, function(err, stack) {
    if (err) {
      return cb(err);
    }

    return cb(null, stack.Resources.CoreServicesASG.Instances);
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
