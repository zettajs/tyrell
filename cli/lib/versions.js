var fs = require('fs');
var async = require('async');
var awsUtils = require('./aws-utils');

var list = module.exports.list = function(AWS, stackName, cb) {
  var cloudformation = new AWS.CloudFormation();
  var autoscaling = new AWS.AutoScaling();

  cloudformation.describeStacks(function(err, stacks) {
    if (err) {
      return cb(err);
    }

    var stacks = stacks.Stacks.filter(function(stack) {
      return stack.Tags.filter(function(tag) { return tag.Key === 'zetta:app:version' }).length > 0;
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
        
        stack.AppVersion = stack.Tags.filter(function(t) { return t.Key === 'zetta:app:version'})[0].Value;
        stack.Resources = resources;

        autoscaling.describeAutoScalingGroups({ AutoScalingGroupNames: [ stack.Resources['ZettaAutoScale'].PhysicalResourceId]}, function(err, data) {
          if (err) {
            return next(err);
          }
          stack.ZettaAutoScale = data.AutoScalingGroups[0];
          next(null, stack);
        });
      });
    }, cb);
  });
};

var create = module.exports.create = function(AWS, config, done) {
  var cloudformation = new AWS.CloudFormation();

  var stackName = config.stack + '-app-' + config.app.version;
  var params = {
    StackName: stackName,
    OnFailure: 'DELETE',
    Parameters: [
      { ParameterKey: 'ZettaStack', ParameterValue: config.stack },
      { ParameterKey: 'InstanceType', ParameterValue: config.app.instance_type },
      { ParameterKey: 'ClusterSize', ParameterValue: config.app.cluster_size },
      { ParameterKey: 'AMI', ParameterValue: config.app.ami },
      { ParameterKey: 'ZettaAppSecurityGroup', ParameterValue: config.app.security_groups },
      { ParameterKey: 'LoadBalancer', ParameterValue: config.app.load_balancer },
      { ParameterKey: 'KeyPair', ParameterValue: config.keyPair }
    ],
    Tags: [
      { Key: 'zetta:stack', Value: config.stack },
      { Key: 'zetta:app:version', Value: config.app.version }
    ],
    TemplateBody: fs.readFileSync('../aws/zetta-asg-cf.json').toString(),
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

        awsUtils.getAsgFromStack(AWS, stack.StackId, function(err, asgName) {
          if (err) {
            return done(err);
          }

          awsUtils.asgInstancesAvailable(AWS, asgName, {}, done);
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
