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
      return stack.Tags.filter(function(tag) { return tag.Key === 'zetta:app:version' }).length > 0;
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

  var userData = fs.readFileSync('../aws/zetta-user-data.template').toString().replace('@@ETCD_DISCOVERY_URL@@', config.discoveryUrl);
  userData = userData.replace('@@ZETTA_VERSION@@', config.app.version);
  
  var template = JSON.parse(fs.readFileSync('../aws/zetta-asg-cf.json').toString());
  template.Resources['ZettaServerLaunchConfig'].Properties.UserData = { 'Fn::Base64': userData };

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
      { ParameterKey: 'KeyPair', ParameterValue: config.keyPair }
    ],
    Tags: [
      { Key: 'zetta:stack', Value: config.stack },
      { Key: 'zetta:app:version', Value: config.app.version }
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

        awsUtils.getAsgFromStack(AWS, stack.StackId, 'ZettaAutoScale', function(err, asgName) {
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


var routeAWS = module.exports.getSSH = function(host, keyPath, cb) {
  var cmd = "etcdctl get /zetta/version";
  var ssh = spawn('ssh', ['-o', 'StrictHostKeyChecking no', '-i', keyPath, host, cmd]);
  var buffer = '';
  ssh.on('exit', function(code, signal) {
    if (code !== 0) {
      return cb(new Error('Non-Zero exit code. Failed to initialize zetta version.'));
    }
    cb(null, JSON.parse(buffer));
  });

  ssh.stdout.on('data', function(chunk) {
    buffer+=chunk.toString(); 
  });  

  return ssh;
};

var routeAWS = module.exports.routeSSH = function(host, keyPath, version, cb) {
  var cmd = "etcdctl set /zetta/version '{ \"version\": \"" + version + "\"}'";
  var ssh = spawn('ssh', ['-o', 'StrictHostKeyChecking no', '-i', keyPath, host, cmd]);
  ssh.on('exit', function(code, signal) {
    if (code !== 0) {
      return cb(new Error('Non-Zero exit code. Failed to initialize zetta version.'));
    }
    cb();
  });

  return ssh;
};

var routeVagrant = module.exports.routeVagrant = function(box, version, cb) {
  var cmd = "etcdctl set /zetta/version '{ \"version\": \"" + version + "\"}'";
  var ssh = Vagrant.command(['ssh', box, '--', cmd], function(code) {
    if(code !== 0) {
      return cb(new Error('Non-Zero exit code. Failed to initialize zetta version.'));
    }
    cb();
  });
  return ssh;
};
