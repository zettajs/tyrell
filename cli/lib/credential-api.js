var url = require('url');
var fs = require('fs');
var path = require('path');
var async = require('async');
var awsUtils = require('./aws-utils');
var databases = require('./databases')
var vpc = require('./vpc');

var ROLE = 'credential-api';
var tagKey = 'zetta:' + ROLE + ':version';

var scale = module.exports.scale = function(AWS, asgName, desired, cb) {
  var autoscaling = new AWS.AutoScaling();

  var params = {
    AutoScalingGroupName: asgName,
    DesiredCapacity: Number(desired)
  };
  autoscaling.setDesiredCapacity(params, cb);
};

var list = module.exports.list = function(AWS, stackName, cb) {
  var cloudformation = new AWS.CloudFormation();
  var autoscaling = new AWS.AutoScaling();

  cloudformation.describeStacks(function(err, stacks) {
    if (err) {
      return cb(err);
    }

    var stacks = stacks.Stacks.filter(function(stack) {
      return stack.Tags.filter(function(tag) { return tag.Key === tagKey }).length > 0;
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

        stack.AppVersion = stack.Tags.filter(function(t) { return t.Key === tagKey})[0].Value;
        stack.Resources = resources;

        // stack.Resources['Instance'].PhysicalResourceId
        next(null, stack);
      });
    }, cb);
  });
};

// config
//  - version
//  - type
//  - size

function getDbUrl(AWS, stackName, versionId, cb) {
  databases.list(AWS, stackName, function(err, results) {
    if (err) {
      return cb(err);
    }
    
    var version = results.filter(function(db) {
      return (db.AppVersion === versionId);
    })[0];

    if (!version) {
      return cb(new Error('Could not find db'));
    }

    var connectionString = version.Outputs.filter(function(param) {
      return param.OutputKey === 'ConnectionString';
    })[0].OutputValue;

    var parsed = url.parse(connectionString);
    parsed.auth = 'credential_api:credential_api';
    return cb(null, url.format(parsed));
  });
}


// Get subnets use stacks vpc parameter
function getSubnets(AWS, stack, cb) {
  vpc.subnetsForVpc(AWS, stack.Parameters['StackVpc'], function(err, data) {
    if (err) {
      return cb(err);
    }

    var privateSubnets = data.filter(function(net) {
      return net.public == false;
    });

    var subnetIdArray = privateSubnets.map(function(netObject){
      return netObject.id;
    });

    return cb(null, subnetIdArray);
  });
}

var create = module.exports.create = function(AWS, stack, config, done) {
  var cloudformation = new AWS.CloudFormation();
  var autoscaling = new AWS.AutoScaling();

  // get private subnets
  getSubnets(AWS, stack, function(err, subnets) {
    if (err) {
      return done(err);
    }

    getDbUrl(AWS, stack.StackName, config.dbVersion, function(err, connectionString) {
      if (err) {
        return done(err);
      }
      
      var userData = fs.readFileSync(path.join(__dirname, '../../roles/' + ROLE + '/aws-user-data.template')).toString();
      userData = userData.replace(/@@ZETTA_STACK@@/g, stack.StackName);
      userData = userData.replace(/@@ZETTA_VERSION@@/g, config.version);
      userData = userData.replace(/@@CORE_SERVICES_ASG@@/g, stack.Resources['CoreServicesASG'].PhysicalResourceId);
      userData = userData.replace(/@@CREDENTIAL_DB_CONNECTION_URL@@/g, connectionString);
      userData = userData.replace(/@@INFLUXDB_HOST@@/g, stack.Parameters['InfluxdbHost']);
      userData = userData.replace(/@@INFLUXDB_USERNAME@@/g, stack.Parameters['InfluxdbUsername']);
      userData = userData.replace(/@@INFLUXDB_PASSWORD@@/g, stack.Parameters['InfluxdbPassword']);

      var template = JSON.parse(fs.readFileSync(path.join(__dirname, '../../roles/'+ ROLE + '/cloudformation.json')).toString());
      template.Resources['ServerLaunchConfig'].Properties.UserData = { 'Fn::Base64': userData };

      var stackName = stack.StackName + '-' + ROLE + '-' + config.version;
      var params = {
        StackName: stackName,
        OnFailure: 'DELETE',
        Capabilities: ['CAPABILITY_IAM'],
        Parameters: [
          { ParameterKey: 'InstanceType', ParameterValue: config.type },
          { ParameterKey: 'AMI', ParameterValue: config.ami },
          { ParameterKey: 'KeyPair', ParameterValue: stack.Parameters['KeyPair'] },
          { ParameterKey: 'ZettaStack', ParameterValue: stack.StackName },
          { ParameterKey: 'Subnets', ParameterValue: subnets.join(',') },
          { ParameterKey: 'SecurityGroups', ParameterValue: [stack.Resources['CoreOsSecurityGroup'].GroupId, stack.Resources['CredentialAPISecurityGroup'].GroupId].join(',') },
          { ParameterKey: 'ClusterSize', ParameterValue: '0' }, // scale after AddToElb process is suspended
          { ParameterKey: 'ELB', ParameterValue: stack.Resources['CredentialAPIELB'].PhysicalResourceId }
        ],
        Tags: [
          { Key: 'zetta:stack', Value: stack.StackName },
          { Key: tagKey, Value: config.version },
          { Key: 'versions:tyrell', Value: require('../package.json').version }
        ],
        TemplateBody: JSON.stringify(template),
        TimeoutInMinutes: 15
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


            awsUtils.getAsgFromStack(AWS, stack.StackId, 'AutoScale', function(err, asgName) {
              if (err) {
                return done(err);
              }

              var params = {
                AutoScalingGroupName: asgName, ScalingProcesses: ['AddToLoadBalancer']
              };

              autoscaling.suspendProcesses(params, function(err, data) {
                if (err) {
                  return done(err);
                }

                scale(AWS, asgName, config.size, function(err) {
                  if (err) {
                    return done(err);
                  }
                  awsUtils.asgInstancesAvailable(AWS, asgName, {}, done);
                });
              });
              
            });
          });
        }
        check();
      });
    });
  });
};

var remove = module.exports.remove = function(AWS, cfName, cb) {
  var cloudformation = new AWS.CloudFormation();
  cloudformation.deleteStack({ StackName: cfName }, cb);
};
