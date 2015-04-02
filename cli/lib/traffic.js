var async = require('async');
var awsUtils = require('./aws-utils');
var stacks = require('./stacks');
var versions = require('./versions');
var routers = require('./routers');

function formatTags(tags) {
  var obj = {};
  tags.forEach(function(tag) {
    obj[tag.Key] = tag.Value;
  });
  return obj;
}

var list = module.exports.list = function(AWS, elbName, cb) {
  var elb = new AWS.ELB();
  var ec2 = new AWS.EC2();
  
  elb.describeLoadBalancers({ LoadBalancerNames: [elbName] }, function(err, data) {
    if (err) {
      return cb(err);
    }
    var lb = data.LoadBalancerDescriptions[0];
    
    var params = {
      LoadBalancerName: elbName,
      Instances: lb.Instances
    };

    if (lb.Instances.length === 0) {
      return cb(null, []);
    }
    
    elb.describeInstanceHealth(params, function(err, data) {
      if(err) {
        return cb(err);
      }

      var states = data.InstanceStates;
      var params = {
        InstanceIds: lb.Instances.map(function(i) { return i.InstanceId; }),
      };

      ec2.describeInstances(params, function(err, data) {
        if (err) {
          return cb(err);
        }

        var instances = [];

        data.Reservations.forEach(function(data) {
          data.Instances.forEach(function(instance) {
            instance.Tags = formatTags(instance.Tags);

            states.some(function(state) {
              if (state.InstanceId === instance.InstanceId) {
                instance.ELBState = state.State;
                return true;
              }
            });
            instances.push(instance);
          });
        });

        return cb(null, instances);
      });
    });
  });
};

var assignRouterToElb = module.exports.assignRouterToElb = function(AWS, stackName, version, cb) {
  var autoscaling = new AWS.AutoScaling();  

  routers.list(AWS, stackName, function(err, all) {
    if (err) {
      return cb(err);
    }

    var activeASG = all.filter(function(router) {
      return router.AppVersion === version;
    })[0];

    var nonActiveASG = all.filter(function(router) {
      return router.AppVersion !== version;
    });
    

    var params = {
      AutoScalingGroupName: activeASG.RouterAutoScale.AutoScalingGroupName,
      ScalingProcesses: ['AddToLoadBalancer']
    };
    // start AddToELB process on active asg
    autoscaling.resumeProcesses(params, function(err, data) {
      if (err) {
        return cb(err);
      }
      
      
      // suspend AddToElb process on all other asgs
      async.each(nonActiveASG, function(router, next) {
        var params = {
          AutoScalingGroupName: router.RouterAutoScale.AutoScalingGroupName,
          ScalingProcesses: ['AddToLoadBalancer']
        };
        autoscaling.suspendProcesses(params, next);
      }, cb);

    });
  });
};

module.exports.route = function(AWS, opts, cb) {
  var elb = new AWS.ELB();

  assignRouterToElb(AWS, opts.stack, opts.version.AppVersion, function(err) {
    if (err) {
      return cb(err);
    }

    list(AWS, opts.elbName, function(err, currentActive) {
      if (err) {
        return cb(err);
      }
      
      currentActive = currentActive.filter(function(instance) {
        return instance.Tags['zetta:router:version'] !== opts.version.AppVersion;
      }).map(function(instance) {
        return { InstanceId: instance.InstanceId };
      });
      
      var asgName = opts.version.Resources['RouterAutoScale'].PhysicalResourceId;
      awsUtils.getAutoScaleInstances(AWS, asgName, function(err, instances) {
        if (err) {
          return cb(err);
        }
        
        var params = {
        Instances: instances.map(function(i) { return { InstanceId: i }; }),
          LoadBalancerName: opts.elbName
        };
        
        elb.registerInstancesWithLoadBalancer(params, function(err, data) {
          if (err) {
            return cb(err);
          }
          awsUtils.asgInstancesAvailableInElb(AWS, opts.elbName, asgName, {}, function(err) {
            if (err) {
              return cb(err);
            }
            
            if (!opts.replace || currentActive.length === 0) {
              return cb();
            }
            
            var params = { Instances: currentActive, LoadBalancerName: opts.elbName };
            elb.deregisterInstancesFromLoadBalancer(params, cb);    
            
          });
        });
      });
    });
  });
};

module.exports.zettaVersion = function(AWS, stackName, keyPath, cb) {
  stacks.ec2List(AWS, stackName, function(err, instances) {
    if (err) {
      return cb(err);
    }
    
    instances = instances.filter(function(instance) {
      return (instance.State.Name === 'running')
    });

    var host = 'core@' + instances[0].PublicDnsName;
    versions.getSSH(host, keyPath, cb);
  });
};

module.exports.setZettaVersion = function(AWS, stackName, version, keyPath, cb) {
  stacks.ec2List(AWS, stackName, function(err, instances) {
    if (err) {
      return cb(err);
    }
    
    instances = instances.filter(function(instance) {
      return (instance.State.Name === 'running')
    });

    var host = 'core@' + instances[0].PublicDnsName;
    versions.routeSSH(host, keyPath, version, cb);
  });
};
