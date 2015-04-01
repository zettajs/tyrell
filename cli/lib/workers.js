var fs = require('fs');
var async = require('async');
var awsUtils = require('./aws-utils');
var Vagrant = require('./vagrant');
var spawn = require('child_process').spawn;
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
        
        next(null, stack);
      });
    }, cb);
  });
};

var create = module.exports.create = function(AWS, config, done) {
  var cloudformation = new AWS.CloudFormation();
  var autoscaling = new AWS.AutoScaling();
  var template = JSON.parse(fs.readFileSync('../aws/device-data-worker-cf.json').toString());

  var stackName = config.stack + '-sqsworker-' + config.app.version;
  var params = {
    StackName: stackName,
    OnFailure: 'DELETE',
    Parameters: [
      { ParameterKey: 'ZettaStack', ParameterValue: config.stack },
      { ParameterKey: 'InstanceType', ParameterValue: config.app.instance_type },
      { ParameterKey: 'AMI', ParameterValue: config.app.ami },
      { ParameterKey: 'SecurityGroups', ParameterValue: config.app.security_groups },
      { ParameterKey: 'KeyPair', ParameterValue: config.keyPair },
      { ParameterKey: 'InstanceProfile', ParameterValue: config.app.instanceProfile },
      { ParameterKey: 'DeviceDataQueueUrl', ParameterValue: config.app.deviceDataQueueUrl },
      { ParameterKey: 'DeviceDataS3Bucket', ParameterValue: config.app.deviceDataS3Bucket },
      { ParameterKey: 'ZettaUsageQueueUrl', ParameterValue: config.app.zettaUsageQueueUrl },
      { ParameterKey: 'ZettaUsageS3Bucket', ParameterValue: config.app.zettaUsageS3Bucket }
    ],
    Tags: [
      { Key: 'zetta:stack', Value: config.stack },
      { Key: 'zetta:sqsworker:version', Value: config.app.version }
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
            done(err);
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

