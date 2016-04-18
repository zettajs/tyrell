var fs = require('fs');
var path = require('path');
var async = require('async');
var awsUtils = require('./aws-utils');
var Vagrant = require('./vagrant');
var spawn = require('child_process').spawn;
var versionToken = /@@ZETTA_VERSION@@/;
var amis = require('./amis');

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


function getInternalMQTTElb(AWS, stack, cb) {
  var elb = new AWS.ELB();

  // ELB is not always created with stack
  if (!stack.Resources['InternalMQTTELB']) {
    return cb();
  }
  
  var elbName = stack.Resources['InternalMQTTELB'].PhysicalResourceId;
  elb.describeLoadBalancers({ LoadBalancerNames: [ elbName ] }, function(err, data) {
    if (err) {
      return cb(err);
    }
    function retDns(obj) { return obj.DNSName; }
    function byName(name, obj) { return obj.LoadBalancerName === name; }
    
    var elbDnsName = data.LoadBalancerDescriptions.filter(byName.bind(null, elbName)).map(retDns)[0];
    return cb(null, elbDnsName);
  });
}

// config
//  - version
//  - type
//  - size
var create = module.exports.create = function(AWS, stack, config, done) {
  var cloudformation = new AWS.CloudFormation();

  // Get the MQTT ELB if it exists on stack
  getInternalMQTTElb(AWS, stack, function(err, mqttDnsName) {
    if (err) {
      return done(err);
    }
    
    var userData = fs.readFileSync(path.join(__dirname, '../../roles/target/aws-user-data.template')).toString();
    userData = userData.replace(/@@ZETTA_STACK@@/g, stack.StackName);
    userData = userData.replace(/@@ZETTA_VERSION@@/g, config.version);
    userData = userData.replace(/@@ZETTA_DEVICE_DATA_QUEUE@@/g, stack.Resources['DeviceDataQueue'].PhysicalResourceId);
    userData = userData.replace(/@@ZETTA_USAGE_QUEUE@@/g, stack.Resources['ZettaUsageQueue'].PhysicalResourceId);
    userData = userData.replace(/@@LOGENTRIES_TOKEN@@/g, stack.Parameters['LogentriesToken']);
    userData = userData.replace(/@@CORE_SERVICES_ASG@@/g, stack.Resources['CoreServicesASG'].PhysicalResourceId);

    
    if (mqttDnsName) {
      userData = userData.replace(/@@MQTT_INTERNAL_BROKER_URL@@/g, 'mqtt://' + mqttDnsName + ':2883'); 
    }

    var template = JSON.parse(fs.readFileSync(path.join(__dirname, '../../roles/target/cloudformation.json')).toString());
    template.Resources['ZettaServerLaunchConfig'].Properties.UserData = { 'Fn::Base64': userData };
    
    var stackName = stack.StackName + '-target-' + config.version;
    var params = {
      StackName: stackName,
      OnFailure: 'DELETE',
      Parameters: [
        { ParameterKey: 'ZettaStack', ParameterValue: stack.StackName },
        { ParameterKey: 'InstanceType', ParameterValue: config.type },
        { ParameterKey: 'ClusterSize', ParameterValue: config.size + '' },
        { ParameterKey: 'AMI', ParameterValue: config.ami },
        { ParameterKey: 'ZettaTargetSecurityGroup', ParameterValue: [stack.Resources['CoreOsSecurityGroup'].GroupId, stack.Resources['TargetSecurityGroup'].GroupId].join(',') },
        { ParameterKey: 'KeyPair', ParameterValue: stack.Parameters['KeyPair'] },
        { ParameterKey: 'InstanceProfile', ParameterValue: stack.Resources['TargetRoleInstanceProfile'].PhysicalResourceId },
        { ParameterKey: 'TargetSubnets', ParameterValue: config.subnets.join(',') }
      ],
      Tags: [
        { Key: 'zetta:stack', Value: stack.StackName },
        { Key: 'zetta:app:version', Value: config.version },
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
