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

var program = require('commander');
var async = require('async');
var VpcTyrell = require('./lib/vpc');
var AWS = require('aws-sdk');
AWS.config.update({ region: 'us-east-1' });
var ec2 = new AWS.EC2();


program
  .parse(process.argv);

var stack = program.args[0];

if(!stack) {
  program.help();
  process.exit(1);
}

VpcTyrell.get(AWS, stack, function(err, data) {
  if(err) {
    return console.log(err);
  } else {
    var vpcId = null;
    Object.keys(data.Resources).forEach(function(resourceKey) {
      var resource = data.Resources[resourceKey];
      if(resource.ResourceType === 'AWS::EC2::VPC') {
        vpcId = resource.PhysicalResourceId;
      }
    });

    var params = {
      Filter: [
        {
          Name: 'vpc-id',
          Values: [
            vpcId
          ]
        }
      ]
    }
    ec2.describeNatGateways(params, function(err, data){
      var gateways = data.NatGateways;

      async.each(gateways, function(gateway, cb) {
        var params = {
          NatGatewayId: gateway.NatGatewayId
        }

        ec2.deleteNatGateway(params, function(err, data){
          if(err) {
            cb(err);
          } else {
            cb();
          }
        });
      }, function(err) {
        if(err) {
          return console.log(err);
        } else {
          VpcTyrell.remove(AWS, stack, function(err, data){
            if(err) {
              return console.log(err);
            } else {
              return console.log('Completed.');
            }
          });
        }
      });
    });
  }
});
