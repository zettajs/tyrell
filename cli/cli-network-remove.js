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
