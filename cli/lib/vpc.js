var fs = require('fs');
var path = require('path');
var async = require('async');
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

      async.map(data.StackResources, function(r, next) {
        next(null, r);
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

        stack.Resources = resources;
        cb(null, stack);
      });

    });
  });
};

var subnetsForVpc = module.exports.subnetsForVpc = function(AWS, vpcId, azs, cb) {
  var params = {
    Filters:[
      {
        Name: 'vpc-id',
        Values: [
          vpcId
        ]
      }
    ]
  };

  var ec2 = new AWS.EC2();
  ec2.describeSubnets(params, function(err, data) {
    if(err) {
      return cb(err);
    }
    var subnets = [];
    data.Subnets.forEach(function(subnet) {
      var obj = {
        id: subnet.SubnetId,
        public: subnet.MapPublicIpOnLaunch,
        az: subnet.AvailabilityZone
      };
      subnets.push(obj);
    });

    if(azs) {
      var azsToFilterOn = azs.split(',')
      subnets = subnets.filter(function(net) {
        return azsToFilterOn.indexOf(net.az) > -1;
      });  
    }

    cb(err, subnets);
  });
}

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
        return tag.Key === 'VPCName';
      });
    }).map(function(s) {
      return s.StackName;
    });

    async.map(stacks, get.bind(null, AWS), cb);
  });
};

function generateStackParams(config) {
  var template = require('../../roles/vpc/vpc-cf.json');

  var stackName = config.stack;
  var params = {
    StackName: stackName,
    OnFailure: 'DELETE',
    Capabilities: ['CAPABILITY_IAM'],
    Parameters: [
      { ParameterKey: 'VPCName', ParameterValue: config.vpcName },
      { ParameterKey: 'VPCCidrBlock', ParameterValue: config.vpcCidrBlock },
      { ParameterKey: 'PublicCidrBlock', ParameterValue: config.publicCidrBlock },
      { ParameterKey: 'Public2CidrBlock', ParameterValue: config.public2CidrBlock },
      { ParameterKey: 'Public3CidrBlock', ParameterValue: config.public3CidrBlock },
      { ParameterKey: 'Public4CidrBlock', ParameterValue: config.public4CidrBlock },
      { ParameterKey: 'PrivateCidrBlock', ParameterValue: config.privateCidrBlock },
      { ParameterKey: 'Private2CidrBlock', ParameterValue: config.private2CidrBlock },
      { ParameterKey: 'Private3CidrBlock', ParameterValue: config.private3CidrBlock },
      { ParameterKey: 'Private4CidrBlock', ParameterValue: config.private4CidrBlock }
    ],
    Tags: [
      { Key: 'VPCName', Value: stackName }
    ],
    TemplateBody: JSON.stringify(template),
    TimeoutInMinutes: 10
  };

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
      next();
    }
  ], function(err) {
    if (err) {
      return cb(err);
    }
    cloudformation.deleteStack({ StackName: name }, cb);
  });
};

// updates the cf template with the latest output from tyrell
// May spin down core services instances depending on the changes of the template
var update = module.exports.update = function(AWS, name, configUpdates, cb) {
  get(AWS, name, function(err, stack) {
    if (err) {
      return cb(err);
    }

    // need discoveryUrl for user-data update
    var config = {
      stack: name,
      discoveryUrl: stack.Parameters.DiscoveryUrl
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
