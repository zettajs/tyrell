// Copyright 2018 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

var fs = require('fs');
var path = require('path');
var async = require('async');

var tagKey = 'zetta:tenant-mgmt-api:version';

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
var create = module.exports.create = function(AWS, stack, config, done) {
  var cloudformation = new AWS.CloudFormation();

  var userData = fs.readFileSync(path.join(__dirname, '../../roles/tenant-mgmt-api/aws-user-data.template')).toString();
  userData = userData.replace(/@@ZETTA_STACK@@/g, stack.StackName);
  userData = userData.replace(/@@ZETTA_VERSION@@/g, config.version);
  userData = userData.replace(/@@ZETTA_DEVICE_DATA_QUEUE@@/g, stack.Resources['DeviceDataQueue'].PhysicalResourceId);
  userData = userData.replace(/@@ZETTA_USAGE_QUEUE@@/g, stack.Resources['ZettaUsageQueue'].PhysicalResourceId);
  userData = userData.replace(/@@LOGENTRIES_TOKEN@@/g, stack.Parameters['LogentriesToken']);
  userData = userData.replace(/@@CORE_SERVICES_ASG@@/g, stack.Resources['CoreServicesASG'].PhysicalResourceId);
  userData = userData.replace(/@@INFLUXDB_HOST@@/g, stack.Parameters['InfluxdbHost']);
  userData = userData.replace(/@@INFLUXDB_USERNAME@@/g, stack.Parameters['InfluxdbUsername']);
  userData = userData.replace(/@@INFLUXDB_PASSWORD@@/g, stack.Parameters['InfluxdbPassword']);
  userData = userData.replace(/@@TENANT_MGMT_MEMORY_LIMIT@@/g, config.memoryLimit);

  var template = JSON.parse(fs.readFileSync(path.join(__dirname, '../../roles/tenant-mgmt-api/cloudformation.json')).toString());
  template.Resources['Instance'].Properties.UserData = { 'Fn::Base64': userData };

  var stackName = stack.StackName + '-tenant-mgmt-api-' + config.version;
  var params = {
    StackName: stackName,
    OnFailure: 'DO_NOTHING',
    Capabilities: ['CAPABILITY_IAM'],
    Parameters: [
      { ParameterKey: 'InstanceType', ParameterValue: config.type },
      { ParameterKey: 'AMI', ParameterValue: config.ami },
      { ParameterKey: 'KeyPair', ParameterValue: stack.Parameters['KeyPair'] },
      { ParameterKey: 'ZettaStack', ParameterValue: stack.StackName },
      { ParameterKey: 'SecurityGroups', ParameterValue: [stack.Resources['CoreOsSecurityGroup'].GroupId, stack.Resources['TenantMgmtSecurityGroup'].GroupId].join(',') },
      { ParameterKey: 'PublicSubnetId', ParameterValue: config.subnet }
    ],
    Tags: [
      { Key: 'zetta:stack', Value: stack.StackName },
      { Key: tagKey, Value: config.version },
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

        done();
      });
    }
    check();
  });
};

var remove = module.exports.remove = function(AWS, cfName, cb) {
  var cloudformation = new AWS.CloudFormation();
  cloudformation.deleteStack({ StackName: cfName }, cb);
};
