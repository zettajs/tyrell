var async = require('async');
var awsUtils = require('./aws-utils');
var stacks = require('./stacks');
var targets = require('./targets');
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


// Turn on version's AddToLoadBalancer process and turn off all other versions AddToLoadBalancer process
var assignRouterToElb = module.exports.assignRouterToElb = function(AWS, type, asg, stackName, version, cb) {
  var autoscaling = new AWS.AutoScaling();

  type.list(AWS, stackName, function(err, all) {
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
      AutoScalingGroupName: activeASG.Resources[asg].PhysicalResourceId,
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
          AutoScalingGroupName: router.Resources[asg].PhysicalResourceId,
          ScalingProcesses: ['AddToLoadBalancer']
        };
        autoscaling.suspendProcesses(params, next);
      }, cb);

    });
  });
};

// type = routers || credential-api
// tag = ''
function routeELB(AWS, type, opts, cb) {
  var elb = new AWS.ELB();
  
  var types = {
    'routers': {
      type: require('./routers'),
      tag: 'zetta:router:version',
      asg: 'RouterAutoScale'
    },
    'credential-api': {
      type: require('./credential-api'),
      tag: 'zetta:credential-api:version',
      asg: 'AutoScale'
    },
    'rabbitmq': {
      type: require('./rabbitmq'),
      tag: 'zetta:rabbitmq:version',
      asg: 'AutoScale'
    },
    'mqttbroker': {
      type: require('./mqttbrokers'),
      tag: 'zetta:mqttbroker:version',
      asg: 'AutoScale'
    },
    'tenant-mgmt-api': {
      type: require('./tenant-mgmt-api'),
      tag: 'zetta:tenant-mgmt-api:version',
      asg: 'AutoScale'
    }
  };

  if (!types[type]) {
    return cb(new Error('Type not valid'));
  }

  var type = types[type];

  // Turn on AddToLoadBalancer for ASG and turn off all other versions AddToLoadBalancer process
  assignRouterToElb(AWS, type.type, type.asg, opts.stack, opts.version.AppVersion, function(err) {
    if (err) {
      return cb(err);
    }

    // Handle singleELB and multiple
    if (typeof opts.elbName === 'string') {
      opts.elbName = [opts.elbName];
    }

    async.each(opts.elbName, function(elbName, next) {
      list(AWS, elbName, function(err, currentActive) {
        if (err) {
          return next(err);
        }

        currentActive = currentActive.filter(function(instance) {
          return instance.Tags[type.tag] !== opts.version.AppVersion;
        }).map(function(instance) {
          return { InstanceId: instance.InstanceId };
        });

        var asgName = opts.version.Resources[type.asg].PhysicalResourceId;
        awsUtils.getAutoScaleInstances(AWS, asgName, function(err, instances) {
          if (err) {
            return next(err);
          }

          function registerNew(cb) {
            // Handle case where new ASG does not have any instances yet
            if (instances.length === 0) {
              return cb();
            }
            
            var params = {
              Instances: instances.map(function(i) { return { InstanceId: i }; }),
              LoadBalancerName: elbName
            };
            
            elb.registerInstancesWithLoadBalancer(params, cb);
          }
          
          registerNew(function(err, data) {
            if (err) {
              return next(err);
            }
            
            awsUtils.asgInstancesAvailableInElb(AWS, elbName, asgName, {}, function(err) {
              if (err) {
                return next(err);
              }

              if (!opts.replace || currentActive.length === 0) {
                return next();
              }

              var params = { Instances: currentActive, LoadBalancerName: elbName };
              elb.deregisterInstancesFromLoadBalancer(params, next);
            });
          });
        });
      });
    }, cb);
  });
}

module.exports.routeMqttBroker = function(AWS, opts, cb) {
  return routeELB(AWS, 'mqttbroker', opts, cb);
};

module.exports.routeRabbitMq = function(AWS, opts, cb) {
  return routeELB(AWS, 'rabbitmq', opts, cb);
};

module.exports.routeCredentialApi = function(AWS, opts, cb) {
  return routeELB(AWS, 'credential-api', opts, cb);
};

module.exports.route = function(AWS, opts, cb) {
  return routeELB(AWS, 'routers', opts, cb);
};

module.exports.tenantMgmtApi = function(AWS, opts, cb) {
  return routeELB(AWS, 'tenant-mgmt-api', opts, cb);
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
    targets.getSSH(host, keyPath, cb);
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
    targets.routeSSH(host, keyPath, version, function(err) {
      if(err) {
        cb(err);
      } else {
        cb();
      }
    });
  });
};
