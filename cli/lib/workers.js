var fs = require('fs');
var path = require('path');
var async = require('async');
var awsUtils = require('./aws-utils');
var Vagrant = require('./vagrant');
var spawn = require('child_process').spawn;
var amis = require('./amis');
var versionToken = /@@ZETTA_VERSION@@/;

var list = module.exports.list = function(AWS, stackName, cb) {
  var cloudformation = new AWS.CloudFormation();
  var autoscaling = new AWS.AutoScaling();

  cloudformation.describeStacks(function(err, stacks) {
    if (err) {
      return cb(err);
    }

    var stacks = stacks.Stacks.filter(function(stack) {
      return stack.Tags.filter(function(tag) { return tag.Key === 'zetta:sqsworker:version' }).length > 0;
    });

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

        stack.AppVersion = stack.Tags.filter(function(t) { return t.Key === 'zetta:sqsworker:version'})[0].Value;
        stack.Resources = resources;

        var AMI = stack.Parameters.filter(function(p) { return p.ParameterKey === 'AMI'; })[0];
        amis.get(AWS, AMI.ParameterValue, function(err, build) {
          if (err) {
            return next(err);
          }
          stack.AMI = build;
          next(null, stack);
        });
      });
    }, cb);
  });
};


// config
//  - version
//  - ami
//  - type

var create = module.exports.create = function(AWS, stack, config, done) {
  var cloudformation = new AWS.CloudFormation();
  var autoscaling = new AWS.AutoScaling();
  var template = JSON.parse(fs.readFileSync(path.join(__dirname, '../../roles/data-worker/cloudformation.json')).toString());
  var stackName = stack.StackName + '-sqsworker-' + config.version;

  var params = {
    StackName: stackName,
    OnFailure: 'DELETE',
    Parameters: [
      { ParameterKey: 'ZettaStack', ParameterValue: stack.StackName },
      { ParameterKey: 'InstanceType', ParameterValue: config.type },
      { ParameterKey: 'AMI', ParameterValue: config.ami },
      { ParameterKey: 'SecurityGroups', ParameterValue: [stack.Resources['RouterSecurityGroup'].GroupId].join(',') },
      { ParameterKey: 'KeyPair', ParameterValue: stack.Parameters['KeyPair'] },
      { ParameterKey: 'InstanceProfile', ParameterValue: stack.Resources['DataWorkerRoleInstanceProfile'].PhysicalResourceId },
      { ParameterKey: 'DeviceDataQueueUrl', ParameterValue: stack.Resources['DeviceDataQueue'].PhysicalResourceId },
      { ParameterKey: 'DeviceDataS3Bucket', ParameterValue: stack.Outputs['DeviceDataBucket'] },
      { ParameterKey: 'ZettaUsageQueueUrl', ParameterValue: stack.Resources['ZettaUsageQueue'].PhysicalResourceId },
      { ParameterKey: 'ZettaUsageS3Bucket', ParameterValue: stack.Outputs['ZettaUsageBucket'] },
      { ParameterKey: 'WorkerPrivateSubnets', ParameterValue: config.subnets },
      { ParameterKey: 'StackAvailabilityZones', ParameterValue: config.azs }

    ],
    Tags: [
      { Key: 'zetta:stack', Value: stack.StackName },
      { Key: 'zetta:sqsworker:version', Value: config.version },
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
          return setTimeout(check, 1000);
        }

        cloudformation.describeStackResources({ StackName: stack.StackName }, function(err, data) {
          if (err) {
            return done(err);
          }

          var resources = {};
          data.StackResources.forEach(function(r) {
            resources[r.LogicalResourceId] = r;
          });

          var params = {
            AutoScalingGroupName: resources['DeviceDataAutoScale'].PhysicalResourceId,
            ScalingProcesses: ['ReplaceUnhealthy']
          };
          autoscaling.suspendProcesses(params, function(err, data) {
            if (err) {
              return done(err);
            }

            var params = {
              AutoScalingGroupName: resources['ZettaUsageAutoScale'].PhysicalResourceId,
              ScalingProcesses: ['ReplaceUnhealthy']
            };
            autoscaling.suspendProcesses(params, done);
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

var scale = module.exports.scale = function(AWS, asgName, desired, cb) {
  var autoscaling = new AWS.AutoScaling();

  var params = {
    AutoScalingGroupName: asgName,
    DesiredCapacity: Number(desired)
  };
  autoscaling.setDesiredCapacity(params, cb);
};
