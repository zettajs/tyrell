var program = require('commander');
var VpcTyrell = require('./lib/vpc');
var AWS = require('aws-sdk');
AWS.config.update({ region: 'us-east-1' });


program
  .option('--vpccidrblock [block]', 'CIDR block for the VPC', '10.0.0.0/16')
  .option('--publiccidrblock [block]', 'CIDR block for the first public subnet', '10.0.0.0/24')
  .option('--public2cidrblock [block]', 'CIDR block for the second public subnet', '10.0.1.0/24')
  .option('--public3cidrblock [block]', 'CIDR block for the third public subnet', '10.0.2.0/24')
  .option('--public4cidrblock [block]', 'CIDR block for the fourth public subnet', '10.0.3.0/24')
  .option('--privatecidrblock [block]', 'CIDR block for the first private subnet', '10.0.4.0/24')
  .option('--private2cidrblock [block]', 'CIDR block for the second private subnet', '10.0.5.0/24')
  .option('--private3cidrblock [block]', 'CIDR block for the third private subnet', '10.0.6.0/24')
  .option('--private4cidrblock [block]', 'CIDR block for the fourth private subnet', '10.0.7.0/24')
  .parse(process.argv);

var stack = program.args[0];

if(!stack) {
  program.help();
  process.exit(1);
}


var opts = {
  stack: stack,
  vpcName: stack,
  vpcCidrBlock: program.vpccidrblock,
  publicCidrBlock: program.publiccidrblock,
  public2CidrBlock: program.public2cidrblock,
  public3CidrBlock: program.public3cidrblock,
  public4CidrBlock: program.public4cidrblock,
  privateCidrBlock: program.privatecidrblock,
  private2CidrBlock: program.private2cidrblock,
  private3CidrBlock: program.private3cidrblock,
  private4CidrBlock: program.private4cidrblock,
};


VpcTyrell.create(AWS, opts, function(err, data) {
  if(err) {
    console.log(err);
    console.log('VPC and Subnets not created');
  } else {
    VpcTyrell.get(AWS, stack, function(err, data) {
      var ec2 = new AWS.EC2();
      if(err) {
        return console.log(err);
      } else {
        var vpcId = null;
        var subnetIds = [];
        var privateSubnetIds = null;
        var routeTableIds = [];
        Object.keys(data.Resources).forEach(function(resourceKey) {
          var resource = data.Resources[resourceKey];
          if(resource.ResourceType === 'AWS::EC2::VPC') {
            vpcId = resource.PhysicalResourceId;
          } else if(resource.ResourceType === 'AWS::EC2::Subnet') {
            if(resource.LogicalResourceId.indexOf('PublicSubnet') > -1) {
              subnetIds.push(resource.PhysicalResourceId);
            } else if(resource.LogicalResourceId.indexOf('PrivateSubnet') > -1) {
              privateSubnetId = resource.PhysicalResourceId;
            }
          } else if (resource.ResourceType === 'AWS::EC2::RouteTable') {
              if(resource.LogicalResourceId.indexOf('PrivateSubnet') > -1) {
                routeTableIds.push(resource.PhysicalResourceId);
              }
          }
        });

      ec2.describeAddresses({}, function(err, data) {
        var addresses = data.Addresses.filter(function(eip){
          return !eip.AssociationId;
        });

        addresses.forEach(function(address, idx) {
          var eipAllocationId = address.AllocationId;
          var subnetId = subnetIds[idx];
          var routeTableId = routeTableIds[idx];
          var natGatewayParams = {
            SubnetId: subnetId,
            AllocationId: eipAllocationId
          };
          ec2.createNatGateway(natGatewayParams, function(err, data) {
            if(err) {
              return console.log(err);
            }
            var natGatewayId = data.NatGateway.NatGatewayId;
            var createRoute = function(routeTableId, natGatewayId) {
              var routeParams = {
                DestinationCidrBlock: '0.0.0.0/0',
                RouteTableId: routeTableId,
                NatGatewayId: natGatewayId
              }

              console.log('Creating route on table: ', routeTableId, ' 0.0.0.0/0 -> ', natGatewayId);
              ec2.createRoute(routeParams, function(err, data) {
                if(err) {
                  console.log(err);
                }
              });
            }

            var intervalId = null;
            var searchForGateway = function() {
              console.log('waiting for gateways to become active...');
              var params = {
                NatGatewayIds: [
                  natGatewayId
                ]
              };

              ec2.describeNatGateways(params, function(err, data){
                var gateway = data.NatGateways[0];
                var natGatewayId = gateway.NatGatewayId;
                if(err) {
                  console.log(err);
                } else if (gateway.State === 'pending') {
                  console.log('Gateway found: ' + gateway.NatGatewayId + ' found, but pending.');
                } else {
                  if(intervalId) {
                    clearInterval(intervalId);
                    createRoute(routeTableId, natGatewayId);

                    console.log('Association complete.');
                  } else {
                    console.log("error clearing interval");
                  }
                }
              });
            }

            intervalId = setInterval(searchForGateway, 3000);
          });
        });

      });
    }
    });
  }
});
