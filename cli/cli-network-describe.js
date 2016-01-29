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
    var resources = data.Resources;
    var typeToIdMappings = {};
    var types = ['AWS::EC2::VPC', 'AWS::EC2::RouteTable', 'AWS::EC2::InternetGateway', 'AWS::EC2::Subnet'];
    Object.keys(resources).forEach(function(resourceKey) {
      var resource = data.Resources[resourceKey];
      var resource = resources[resourceKey];
      var id = resource.PhysicalResourceId;
      var type = resource.ResourceType;
      if(type === 'AWS::EC2::VPC') {
        vpcId = id;
      }
      if(types.indexOf(type) > -1) {
        if (typeToIdMappings[type]) {
          typeToIdMappings[type].push(id);
        } else {
          typeToIdMappings[type] = [id];
        }
      }
    });
    typeToIdMappings['AWS::EC2::NATGATEWAY'] = [vpcId];
    var natGateways = [];
    var internetGateways = [];
    var subnets = [];
    var vpcs = [];
    var routes = [];
    async.forEachOf(typeToIdMappings, function(value, key, callback){
      if (key === 'AWS::EC2::NATGATEWAY') {
        var params = {
          Filter: [
            {
              Name: 'vpc-id',
              Values: [
                vpcId
              ]
            }
          ]
        };

        ec2.describeNatGateways(params, function(err, data){
          if(err) {
            callback(err);
          } else {
            natGateways = data.NatGateways;
            callback();
          }
        });
      } else if (key === 'AWS::EC2::Subnet') {
        var params = {
          SubnetIds: value
        }

        ec2.describeSubnets(params, function(err, data){
          if(err) {
            callback(err);
          } else {
            subnets = data.Subnets;
            callback();
          }
        });
      } else if (key === 'AWS::EC2::VPC') {
        var params = {
          VpcIds: value
        }
        ec2.describeVpcs(params, function(err, data){
          if(err) {
            callback(err);
          } else {
            vpcs = data.Vpcs;
            callback();
          }
        });
      } else if (key === 'AWS::EC2::RouteTable') {
        var params = {
          RouteTableIds: value
        }

        ec2.describeRouteTables(params, function(err, data){
          if(err) {
            callback(err);
          } else {
            routes = data.RouteTables;
            callback();
          }
        });
      } else if (key === 'AWS::EC2::InternetGateway') {
        var params = {
          InternetGatewayIds: value
        }

        ec2.describeInternetGateways(params, function(err, data){
          if(err) {
            callback(err);
          } else {
            internetGateways = data.InternetGateways;
            callback();
          }
        });
      }
    }, function(err) {

      if(err) {
        return console.log(err);
      }

      console.log('======VPC======');
      vpcs.forEach(function(vpc){
        console.log(vpc.VpcId, vpc.State, vpc.CidrBlock);
      });
      console.log('======Subnets======');
      subnets.forEach(function(subnet){
        var publicOrPrivate = subnet.MapPublicIpOnLaunch ? 'Public' : 'Private'
        console.log(subnet.SubnetId, publicOrPrivate, subnet.CidrBlock, subnet.AvailabilityZone);
      });
      console.log('======Internet Gateway======');
      internetGateways.forEach(function(gateway){
        console.log(gateway.InternetGatewayId);
      });
      console.log('======NAT Gateways======');
      natGateways.forEach(function(gateway){
        console.log(gateway.NatGatewayId, gateway.SubnetId, gateway.State);
      });
      console.log('======Routes======');
      routes.forEach(function(routes){
        console.log('******');
        console.log(routes.RouteTableId);
        console.log('Routes');
        routes.Routes.forEach(function(route){
          console.log(route);
        });

      })
    });

  }
});
