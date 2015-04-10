var fs = require('fs');
var async = require('async');
var versions = require('./versions');
var routers = require('./routers');
var workers = require('./workers');

var get = module.exports.get = function(AWS, stackName, cb) {
  var ec2 = new AWS.EC2();
  var cloudformation = new AWS.CloudFormation();
  
  cloudformation.describeStacks({ StackName: stackName }, function(err, stack) {
    if (err) {
      return cb(err);
    }
    stack = stack.Stacks[0];

    var params = {};
    stack.Parameters.forEach(function(p) {
      params[p.ParameterKey] = p.ParameterValue;
    });
    stack.Parameters = params;

    cloudformation.describeStackResources({ StackName: stackName }, function(err, data) {
      if (err) {
        return cb(err);
      }

      function getSgGroupId(sgName, cb) {
        ec2.describeSecurityGroups({ GroupNames: [sgName] }, function(err, data) {
          if (err) {
            return cb(err);
          }
          return cb(null, data.SecurityGroups[0].GroupId);
        });
      }
      async.map(data.StackResources, function(r, next) {
        if (r.ResourceType === 'AWS::EC2::SecurityGroup') {
          getSgGroupId(r.PhysicalResourceId, function(err, id) {
            if (err) {
              return next(err);
            }
            r.GroupId = id;
            next(null, r);
          });
        } else {
          next(null, r);
        }
      }, function(err, result) {
        if (err) {
          return cb(err);
        }

        var resources = {};
        result.forEach(function(r) {
          resources[r.LogicalResourceId] = r;
        });

        stack.Resources = resources;
        cb(null, stack);
      });

    });
  });
};

var list = module.exports.list = function(AWS, cb) {
  var cloudformation = new AWS.CloudFormation();
  
  cloudformation.describeStacks({}, function(err, data) {
    if (err) {
      return cb(err);
    }
    var stacks = data.Stacks.filter(function(stack) {
      if (stack.StackStatus !== 'CREATE_COMPLETE') {
        return false;
      }

      return stack.Tags.some(function(tag) {
        return tag.Key === 'zetta:stack:main';
      });
    }).map(function(s) {
      return s.StackName;
    });

    async.map(stacks, get.bind(null, AWS), cb);
  });
};

var create = module.exports.create = function(AWS, config, done) {
  var cloudformation = new AWS.CloudFormation();

  var stackName = config.stack;
  var params = {
    StackName: stackName,
    OnFailure: 'DELETE',
    Capabilities: ['CAPABILITY_IAM'],
    Parameters: [
      { ParameterKey: 'DiscoveryUrl', ParameterValue: config.discoveryUrl },
      { ParameterKey: 'KeyPair', ParameterValue: config.keyPair },
      { ParameterKey: 'LogentriesToken', ParameterValue: config.logentriesToken }
    ],
    Tags: [
      { Key: 'zetta:stack', Value: stackName },
      { Key: 'zetta:stack:main', Value: 'true' }
    ],
    TemplateBody: JSON.stringify(require('../../aws/initial-stack-cf.json')),
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
        done(null, stack);
      });
    }
    check();
  });

};

var remove = module.exports.remove = function(AWS, name, cb) {
  var cloudformation = new AWS.CloudFormation();


  async.parallel([
    function(next){
      versions.list(AWS, name, function(err, results) {
        if (err) {
          return next(err);
        }
        
        async.each(results, function(version, next) {
          versions.remove(AWS, version.StackName, next);
        }, next);
      });
    },
    function(next){
      routers.list(AWS, name, function(err, results) {
        if (err) {
          return next(err);
        }
        
        async.each(results, function(version, next) {
          routers.remove(AWS, version.StackName, next);
        }, next);
      });
    },
    function(next){
      workers.list(AWS, name, function(err, results) {
        if (err) {
          return next(err);
        }
        
        async.each(results, function(version, next) {
          workers.remove(AWS, version.StackName, next);
        }, next);
      });
    }
  ], function(err) {
    if (err) {
      return cb(err);
    }
    cloudformation.deleteStack({ StackName: name }, cb);
  });
};

// list all ec2 instances for a stack. Includes routers and versions
var ec2List = module.exports.ec2List = function(AWS, name, cb) {
  var ec2 = new AWS.EC2();
  var instances = [];
  async.parallel([
    function(next) {
      routers.list(AWS, name, function(err, routers) {
        if (err) {
          return next(err);
        }
        
        instances = instances.concat.apply(instances, routers.map(function(router) { return router.RouterAutoScale.Instances; }));
        next();
      });
    },
    function(next) {
      versions.list(AWS, name, function(err, routers) {
        if (err) {
          return next(err);
        }
        
        instances = instances.concat.apply(instances, routers.map(function(router) { return router.ZettaAutoScale.Instances; }));
        next();
      });      
    }
  ], function(err) {
    if (err) {
      return cb(err);
    }

    var params = { InstanceIds: instances.map(function(i) { return i.InstanceId; }) };
    ec2.describeInstances(params, function(err, data) {
      if (err) {
        return cb(err);
      }
      
      var instances = [];
      data.Reservations.forEach(function(data) {
        data.Instances.forEach(function(instance) {
          instances.push(instance);
        });
      });
      
      return cb(null, instances);
    });
  });

};
