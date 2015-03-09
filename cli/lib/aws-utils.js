function asgInstancesAvailable(AWS, asgName, opts, cb) {
  getAutoScaleInstances(AWS, asgName, function(err, instances) {
    if (err) {
      return cb(err);
    }


    function wait() {
      asgInstancesState(AWS, instances, function(err, status) {
        if (err) {
          return cb(err);
        }
        
        if(!status) {
          setTimeout(wait, 1000);
          return;
        }
        cb();
      })
    }
    wait();
    
  });
}
module.exports.asgInstancesAvailable = asgInstancesAvailable;
function asgInstancesAvailableInElb(AWS, elbName, asgName, opts, cb) {
  getAutoScaleInstances(AWS, asgName, function(err, instances) {
    if (err) {
      return cb(err);
    }

    function wait() {
      elbInstancesState(AWS, elbName, instances, function(err, status) {
        if (err) {
          return cb(err);
        }
        
        if(!status) {
          setTimeout(wait, 1000);
          return;
        }
        cb();
      })
    }
    wait();
  });
};
module.exports.asgInstancesAvailableInElb = asgInstancesAvailableInElb;

function asgRemoveInstancesFromElb(AWS, elbName, asgName, opts, cb) {
  var elb = new AWS.ELB();
  
  getAutoScaleInstances(AWS, asgName, function(err, instances) {
    if (err) {
      return cb(err);
    }

    var params = {
      Instances: instances.map(function(i) { return { InstanceId: i }; }),
      LoadBalancerName: elbName
    };
    elb.deregisterInstancesFromLoadBalancer(params, cb);
  });
};
module.exports.asgRemoveInstancesFromElb = asgRemoveInstancesFromElb;


function elbInstancesState(AWS, elbName, instances, cb) {
  var elb = new AWS.ELB();
  
  var params = {
    LoadBalancerName: elbName,
    Instances: instances.map(function(i) {return { InstanceId: i }; })
  };

  elb.describeInstanceHealth(params, function(err, data) {
    if (err) {
      return cb(err);
    }

    cb(null, data.InstanceStates.every(function(i) {
      return i.State === 'InService';
    }));
  });
}
module.exports.elbInstancesState = elbInstancesState;

function asgInstancesState(AWS, instances, cb) {
  var autoscaling = new AWS.AutoScaling();

  var params = {
    InstanceIds: instances,
    MaxRecords: 50
  };

  autoscaling.describeAutoScalingInstances(params, function(err, data) {
    if (err) {
      return cb(err);
    }

    cb(null, data.AutoScalingInstances.every(function(i) {
      return i.LifecycleState === 'InService';
    }));
  });
}
module.exports.asgInstancesState = asgInstancesState;



function getAsgFromStack(AWS, StackId, ResourceId, cb) {
  var cloudformation = new AWS.CloudFormation();

  var params = {
    LogicalResourceId: ResourceId,
    StackName: StackId
  };
  cloudformation.describeStackResource(params, function(err, data) {
    if (err) {
      return cb(err);
    }
    return cb(null, data.StackResourceDetail.PhysicalResourceId);
  });
}
module.exports.getAsgFromStack = getAsgFromStack;


function getAutoScaleInstances(AWS, name, cb) {
  var autoscaling = new AWS.AutoScaling();
  
  var params = { AutoScalingGroupNames: [name] };
  autoscaling.describeAutoScalingGroups(params, function(err, data) {
    if (err) {
      return cb(err);
    }
    if (!data.AutoScalingGroups[0]) {
      return cb(new Error('AutoScaling group not found.'));
    }
    var instances = data.AutoScalingGroups[0].Instances.map(function(instance) {
      return instance.InstanceId;
    });
    return cb(null, instances);
  });
}
module.exports.getAutoScaleInstances = getAutoScaleInstances;


