var url = require('url');
var fs = require('fs');
var crypto = require('crypto');
var path = require('path');
var async = require('async');
var archiver = require('archiver');
var vpc = require('./vpc');

var ROLE = 'database';
var tagKey = 'zetta:' + ROLE + ':version';

var provision = module.exports.provision = function(AWS, stack, masterUser, masterPassword, cb) {
  var lambda = new AWS.Lambda();
  var iam = new AWS.IAM();
  
  var inputPath = path.join(__dirname, '../../roles/database/sql/');
  var archive = archiver('zip');

  var bufs = [];
  archive.on('data', function(d){ bufs.push(d); });
  archive.on('end', function () {
    var buf = Buffer.concat(bufs);
    
    var privateSubnets = stack.Parameters.filter(function(param) {
      return param.ParameterKey === 'PrivateSubnets';
    })[0].ParameterValue;

    iam.getRole({ RoleName: stack.Resources['LambdaRole'].PhysicalResourceId }, function(err, data) {
      if (err) {
        return cb(err);
      }

      var functionName = 'db-' + stack.StackName + '-' + new Date().getTime();
      if (functionName.length > 64) {
        functionName = functionName.substr(functionName.length-64);
      }
      var params = {
        Code: {
          ZipFile: buf
        },
        FunctionName: functionName, /* required */
        Handler: 'index.handler', /* required */
        Role: data.Role.Arn, /* required */
        Runtime: 'nodejs', /* required */
        Publish: false,
        Timeout: 60,
        VpcConfig: {
          SecurityGroupIds: [stack.Resources['LambdaProvisionSecurityGroup'].PhysicalResourceId],
          SubnetIds: privateSubnets.split(',')
        }
      };
      lambda.createFunction(params, function(err, data) {
        if (err) {
          return cb(err);
        }

        var cleanupLambdaFunction = function(cb) {
          lambda.deleteFunction({ FunctionName: functionName }, function(err, data) {
            cb();
          });
        };
        var origCb = cb;
        cb = function() {
          args = arguments;
          cleanupLambdaFunction(function() {
            origCb.apply(null, args);
          });
        };


        var connectionString = stack.Outputs.filter(function(param) {
          return param.OutputKey === 'ConnectionString';
        })[0].OutputValue;

        var parsed = url.parse(connectionString);
        parsed.auth = masterUser + ':' + masterPassword;

        var params = {
          FunctionName: functionName,
          InvocationType: 'RequestResponse',
          LogType: 'Tail',
          Payload: JSON.stringify({ connectionString: url.format(parsed) }),
        };

        lambda.invoke(params, function(err, data) {
          if (err) {
            return cb(err);
          }

          if (data.FunctionError) {
            return cb(new Error(JSON.parse(data.Payload).errorMessage));
          }
          cb();
        });
      });
    });
  });
  
  archive.on('error', cb);
  archive.bulk([
    { expand: true, cwd: inputPath, src: ['**'] }
  ]);
  archive.finalize();
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
      if (stack.StackStatus !== 'CREATE_COMPLETE') {
        return false;
      }
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


// Get privates subnets from stack's vpc param
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

  getSubnets(AWS, stack, function(err, subnets) {
    if (err) {
      return done(err);
    }

    var template = JSON.parse(fs.readFileSync(path.join(__dirname, '../../roles/' + ROLE + '/cloudformation.json')).toString());

    var stackName = stack.StackName + '-' + ROLE + '-' + config.version;
    var userName = 'u' + crypto.randomBytes(6).toString('hex');
    var password =  crypto.randomBytes(16).toString('hex');
    
    var params = {
      StackName: stackName,
      OnFailure: 'DO_NOTHING',
      Capabilities: ['CAPABILITY_IAM'],
      Parameters: [
        { ParameterKey: 'DBName', ParameterValue: 'db' + config.version },
        { ParameterKey: 'DBAllocatedStorage', ParameterValue: config.size+'' },
        { ParameterKey: 'DBClass', ParameterValue: config.type },
        { ParameterKey: 'DBUsername', ParameterValue: userName },
        { ParameterKey: 'DBPassword', ParameterValue: password },
        { ParameterKey: 'CredentialAPISecurityGroup', ParameterValue: stack.Resources['CredentialAPISecurityGroup'].GroupId },
        { ParameterKey: 'MultiAZ', ParameterValue: (config.multiAz) ? 'true' : 'false' },
        { ParameterKey: 'ZettaStack', ParameterValue: stack.StackName },
        { ParameterKey: 'StackVpc', ParameterValue: stack.Parameters['StackVpc'] },
        { ParameterKey: 'PrivateSubnets', ParameterValue: subnets.join(',') }
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

          cloudformation.describeStackResources({ StackName: stackName }, function(err, data) {
            if (err) {
              return done(err);
            }

            var resources = {};
            data.StackResources.forEach(function(r) {
              resources[r.LogicalResourceId] = r;
            });

            stack.Resources = resources;
            stack.userName = userName;
            stack.password = password;
            provision(AWS, stack, userName, password, function(err) {
              if (err) {
                return done(err, stack);
              }
              done(null, stack);
            });
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
