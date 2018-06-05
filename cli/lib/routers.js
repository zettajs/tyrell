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
var awsUtils = require('./aws-utils');
var amis = require('./amis');

var scale = module.exports.scale = function(AWS, asgName, desired, cb) {
  var autoscaling = new AWS.AutoScaling();

  var params = {
    AutoScalingGroupName: asgName,
    DesiredCapacity: Number(desired)
  };
  autoscaling.setDesiredCapacity(params, cb);
};

var list = module.exports.list = function(AWS, stackName, cb) {
  var cloudformation = new AWS.CloudFormation();
  var autoscaling = new AWS.AutoScaling();

  cloudformation.describeStacks(function(err, stacks) {
    if (err) {
      return cb(err);
    }

    // filter with only router cf
    var stacks = stacks.Stacks.filter(function(stack) {
      return stack.Tags.filter(function(tag) {
        return tag.Key === 'zetta:router:version';
      }).length > 0;
    });

    // filter stack name
    stacks = stacks.filter(function(stack) {
      return stack.Tags.filter(function(tag) {
        return tag.Key === 'zetta:stack' && tag.Value === stackName;
      }).length > 0;
    });

    async.map(stacks, function(stack, next) {
      cloudformation.describeStackResources({ StackName: stack.StackName }, function(err, data) {
        if (err) {
          return next(err);
        }

        var resources = {};
        data.StackResources.forEach(function(r) {
          resources[r.LogicalResourceId] = r;
        });

        stack.AppVersion = stack.Tags.filter(function(t) { return t.Key === 'zetta:router:version'})[0].Value;
        stack.Resources = resources;

        autoscaling.describeAutoScalingGroups({ AutoScalingGroupNames: [ stack.Resources['RouterAutoScale'].PhysicalResourceId]}, function(err, data) {
          if (err) {
            return next(err);
          }
          stack.RouterAutoScale = data.AutoScalingGroups[0];

          stack.RouterAutoScale.AddToLoadBalancer = stack.RouterAutoScale.SuspendedProcesses.every(function(p) {
            return p.ProcessName !== 'AddToLoadBalancer';
          });

          var AMI = stack.Parameters.filter(function(p) { return p.ParameterKey === 'AMI'; })[0];
          amis.get(AWS, AMI.ParameterValue, function(err, build) {
            if (err) {
              return next(err);
            }
            stack.AMI = build;
            next(null, stack);
          });
        });
      });
    }, cb);
  });
};


// config
// - version
// - type
// - size
// - ami
var create = module.exports.create = function(AWS, stack, config, done) {
  var cloudformation = new AWS.CloudFormation();
  var autoscaling = new AWS.AutoScaling();

  var userData = fs.readFileSync(path.join(__dirname, '../../roles/router/aws-user-data.template')).toString();

  userData = userData.replace(/@@ZETTA_STACK@@/g, stack.StackName);
  userData = userData.replace(/@@ZETTA_VERSION@@/g, config.version);
  userData = userData.replace(/@@LOGENTRIES_TOKEN@@/g, stack.Parameters['LogentriesToken']);
  userData = userData.replace(/@@CORE_SERVICES_ASG@@/g, stack.Resources['CoreServicesASG'].PhysicalResourceId);
  userData = userData.replace(/@@INFLUXDB_HOST@@/g, stack.Parameters['InfluxdbHost']);
  userData = userData.replace(/@@INFLUXDB_USERNAME@@/g, stack.Parameters['InfluxdbUsername']);
  userData = userData.replace(/@@INFLUXDB_PASSWORD@@/g, stack.Parameters['InfluxdbPassword']);
  userData = userData.replace(/@@ROUTER_MEMORY_LIMIT@@/g, config.memoryLimit);

  var template = JSON.parse(fs.readFileSync(path.join(__dirname, '../../roles/router/cloudformation.json')).toString());
  template.Resources['ServerLaunchConfig'].Properties.UserData = { 'Fn::Base64': userData };

  var stackName = stack.StackName + '-router-' + config.version;
  var params = {
    StackName: stackName,
    OnFailure: 'DELETE',
    Parameters: [
      { ParameterKey: 'ZettaStack', ParameterValue: stack.StackName },
      { ParameterKey: 'InstanceType', ParameterValue: config.type },
      { ParameterKey: 'ClusterSize', ParameterValue: '0' }, // scale after AddToElb process is suspended
      { ParameterKey: 'AMI', ParameterValue: config.ami },
      { ParameterKey: 'RouterSecurityGroups', ParameterValue: [stack.Resources['CoreOsSecurityGroup'].GroupId, stack.Resources['RouterSecurityGroup'].GroupId].join(',') },
      { ParameterKey: 'KeyPair', ParameterValue: stack.Parameters['KeyPair'] },
      { ParameterKey: 'ZettaELB', ParameterValue: stack.Resources['ZettaELB'].PhysicalResourceId },
      { ParameterKey: 'InstanceProfile', ParameterValue: stack.Resources['RouterRoleInstanceProfile'].PhysicalResourceId },
      { ParameterKey: 'RouterSubnets', ParameterValue: config.subnets.join(',') }
    ],
    Tags: [
      { Key: 'zetta:stack', Value: stack.StackName },
      { Key: 'zetta:router:version', Value: config.version },
      { Key: 'versions:tyrell', Value: require('../package.json').version }
    ],
    TemplateBody: JSON.stringify(template),
    TimeoutInMinutes: 5
  };

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
          return setTimeout(check, 5000);
        }

        awsUtils.getAsgFromStack(AWS, stack.StackId, 'RouterAutoScale', function(err, asgName) {
          if (err) {
            return done(err);
          }

          var params = {
            AutoScalingGroupName: asgName, ScalingProcesses: ['AddToLoadBalancer']
          };

          autoscaling.suspendProcesses(params, function(err, data) {
            if (err) {
              return done(err);
            }

            scale(AWS, asgName, config.size, function(err) {
              if (err) {
                return done(err);
              }
              awsUtils.asgInstancesAvailable(AWS, asgName, {}, done);
            });
          });

        });
      });
    }
    check();
  });
};

var remove = module.exports.remove = function(AWS, cfName, cb) {
  var cloudformation = new AWS.CloudFormation();
  cloudformation.deleteStack({ StackName: cfName }, cb);
};
