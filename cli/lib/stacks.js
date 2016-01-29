var fs = require('fs');
var path = require('path');
var async = require('async');
var targets = require('./targets');
var routers = require('./routers');
var workers = require('./workers');
var tenantMgmt = require('./tenant-mgmt-api')
var utils = require('./aws-utils');

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
        } else if (r.LogicalResourceId === 'CoreServicesASG') {
          utils.getAutoScaleInstances(AWS, r.PhysicalResourceId, function(err, instances) {
            if (err) {
              return next(err);
            }

            if (instances.length > 0) {
              ec2.describeInstances({ InstanceIds: instances }, function(err, data) {
                if (err) {
                  return next(err);
                }

                var instances = [];
                data.Reservations.forEach(function(res) {
                  instances = instances.concat(res.Instances);
                });
                r.Instances = instances;
                next(null, r);
              });
            } else {
              r.Instances = [];
              next(null, r);
            }
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

        var Outputs = {};
        stack.Outputs.forEach(function(key) {
          Outputs[key.OutputKey] = key.OutputValue;
        });
        stack.Outputs = Outputs;

        stack.etcdPeers = [];
        resources['CoreServicesASG'].Instances.forEach(function(instance) {
          if (instance.PrivateIpAddress) {
            stack.etcdPeers.push(instance.PrivateIpAddress);
          }
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

function generateStackParams(config) {
  var template = require('../../roles/initial-stack-cf.json');
  var userData = fs.readFileSync(path.join(__dirname, '../../roles/core-services/aws-user-data.template')).toString();
  template.Resources['CoreServicesLaunchConfig'].Properties.UserData = { 'Fn::Base64': userData };

  var stackName = config.stack;
  var params = {
    StackName: stackName,
    OnFailure: 'DELETE',
    Capabilities: ['CAPABILITY_IAM'],
    Parameters: [
      { ParameterKey: 'KeyPair', ParameterValue: config.keyPair },
      { ParameterKey: 'LogentriesToken', ParameterValue: config.logentriesToken },
      { ParameterKey: 'ZettaStack', ParameterValue: config.stack },
      { ParameterKey: 'CoreServicesAMI', ParameterValue: config.ami },
      { ParameterKey: 'CoreServicesInstanceType', ParameterValue: config.instanceType },
      { ParameterKey: 'CoreServicesSize', ParameterValue: '' + config.size }
    ],
    Tags: [
      { Key: 'zetta:stack', Value: stackName },
      { Key: 'zetta:stack:main', Value: 'true' },
      { Key: 'versions:tyrell', Value: require('../package.json').version }
    ],
    TemplateBody: JSON.stringify(template),
    TimeoutInMinutes: 15
  };

  if (config.deviceDataBucket) {
    params.Parameters.push({ ParameterKey: 'ExistingDeviceDataBucket', ParameterValue: '' + config.deviceDataBucket });
    params.Parameters.push({ ParameterKey: 'UseExistingDeviceDataBucket', ParameterValue: 'true' });
  }

  if (config.zettaUsageBucket) {
    params.Parameters.push({ ParameterKey: 'ExistingZettaUsageBucket', ParameterValue: '' + config.zettaUsageBucket });
    params.Parameters.push({ ParameterKey: 'UseExistingZettaUsageBucket', ParameterValue: 'true' });
  }

  return params;
}

var create = module.exports.create = function(AWS, config, done) {
  var cloudformation = new AWS.CloudFormation();

  var stackName = config.stack;
  var params = generateStackParams(config);

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
      targets.list(AWS, name, function(err, results) {
        if (err) {
          return next(err);
        }

        async.each(results, function(version, next) {
          targets.remove(AWS, version.StackName, next);
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
    },
    function(next) {
      tenantMgmt.list(AWS, name, function(err, results) {
        if (err) {
          return next(err);
        }

        async.each(results, function(version, next) {
          tenantMgmt.remove(AWS, version.StackName, next);
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

// list all ec2 instances for a stack. Includes routers and targets
var ec2List = module.exports.ec2List = function(AWS, name, cb) {
  get(AWS, name, function(err, stack) {
    if (err) {
      return cb(err);
    }

    return cb(null, stack.Resources.CoreServicesASG.Instances);
  });
};


// updates the cf template with the latest output from tyrell
// May spin down core services instances depending on the changes of the template
var update = module.exports.update = function(AWS, name, configUpdates, cb) {
  get(AWS, name, function(err, stack) {
    if (err) {
      return cb(err);
    }

    var config = {
      stack: name,
    };

    Object.keys(configUpdates).forEach(function(k) {
      config[k] = configUpdates[k];
    });

    var params = generateStackParams(config);
    params.Parameters.forEach(function(v) {
      if (v.ParameterValue === undefined || v.ParameterValue === 'undefined') {
        delete v.ParameterValue;
        v.UsePreviousValue = true;
      }
    });

    params.UsePreviousTemplate = false;
    delete params.Tags;
    delete params.TimeoutInMinutes;
    delete params.OnFailure;

    var cloudformation = new AWS.CloudFormation();
    cloudformation.updateStack(params, cb);
  });
};

var merge = module.exports.merge = function(AWS, oldStackName, newStackName, cb) {
  var cloudformation = new AWS.CloudFormation();

  var getStack = function(name, next) {
    cloudformation.describeStacks({ StackName: name }, function(err, stack) {
      if (err) {
        return next(err);
      }
      var stack = stack.Stacks[0];
      cloudformation.describeStackResources({ StackName: name }, function(err, data) {
        if (err) {
          return next(err);
        }
        var resources = {};
        data.StackResources.forEach(function(resource) {
          resources[resource.LogicalResourceId] = resource;
        });
        stack.Resources = resources;
        next(null, stack);
      });
    });
  };

  getStack(oldStackName, function(err, oldStack) {
    if (err) {
      return cb(err);
    }
    getStack(newStackName, function(err, newStack) {
      if (err) {
        return cb(err);
      }

      var s3 = new AWS.S3();

      var getKeys = function(type, next, marker, keys) {
        if (!keys) {
          keys = [];
        }
        var params = {
          Bucket: oldStack.Resources[type].PhysicalResourceId,
          MaxKeys: 10000
        };
        if (marker) {
          params.Marker = marker;
        }

        s3.listObjects(params, function(err, data) {
          if (err) {
            return next(err);
          }
          data.Contents.forEach(function(obj) {
            keys.push(obj.Key);
          });

          if (data.IsTruncated) {
            return getKeys(type, next, keys[keys.length - 1], keys);
          } else {
            return next(null, keys);
          }
        });
      };

      var move = function(type, key, next) {
        var params = {
          Bucket: newStack.Resources[type].PhysicalResourceId,
          Key: key,
          CopySource: encodeURI(oldStack.Resources[type].PhysicalResourceId + '/' + key),
          MetadataDirective: 'COPY'
        };
        s3.copyObject(params, function(err) {
          if (err) {
            return next(err);
          }

          s3.deleteObject({ Key: key, Bucket: oldStack.Resources[type].PhysicalResourceId }, next);
        });
      };

      getKeys('DeviceDataBucket', function(err, keys) {
        if (err) {
          return cb(err);
        }
        console.log(keys.length);
        async.eachLimit(keys, 20, move.bind(null, 'DeviceDataBucket'), function(err) {
          if (err) {
            return cb(err);
          }

          getKeys('ZettaUsageBucket', function(err, keys) {
            if (err) {
              return cb(err);
            }
            async.eachLimit(keys, 20, move.bind(null, 'ZettaUsageBucket'), function(err) {
              cb(err);
            });
          });
        });
      });

    });
  });
};
