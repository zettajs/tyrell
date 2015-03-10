var awsUtils = require('./aws-utils');

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

module.exports.route = function(AWS, opts, cb) {
  var elb = new AWS.ELB();

  list(AWS, opts.elbName, function(err, currentActive) {
    if (err) {
      return cb(err);
    }

    currentActive = currentActive.filter(function(instance) {
      return instance.Tags['zetta:app:version'] !== opts.version.AppVersion;
    }).map(function(instance) {
      return { InstanceId: instance.InstanceId };
    });

    var asgName = opts.version.Resources['ZettaAutoScale'].PhysicalResourceId;
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
      
          var params = {
            Instances: currentActive,
            LoadBalancerName: opts.elbName
          };
          elb.deregisterInstancesFromLoadBalancer(params, function(err, data) {
            if (err) {
              return cb(err);
            }
            cb();
          });
        });
      });
    });
    
  }); 
};
