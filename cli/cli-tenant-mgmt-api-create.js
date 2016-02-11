var crypto = require('crypto');
var program = require('commander');
var AWS = require('aws-sdk');
var stacks = require('./lib/stacks');
var tenantMgmt = require('./lib/tenant-mgmt-api');

AWS.config.update({region: 'us-east-1'});

program
  .option('-a, --ami <ami>', 'Existing AMI to use.')
  .option('--type <instance type>', 'Instance type to use. [t2.micro]', 't2.micro')
  .option('--version <app version>', 'Logical version of the app being deployed', crypto.randomBytes(6).toString('hex'))
  .option('-v, --vpc <vpc>', 'Indicate which VPC to deploy to.')
  .parse(process.argv);


var name = program.args[0];
if (!name) {
  program.help();
  process.exit(1);
}

if (!program.ami || !(/ami-*/).test(program.ami)) {
  program.help();
  return program.exit(1);
}

function getSubnets(cb) {
  vpc.subnetsForVpc(AWS, program.vpc, function(err, data){
    if(err) {
      cb(err);
    } else {
      cb(null, data);
    }
  });
}

stacks.get(AWS, name, function(err, stack) {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  getSubnets(function(err, data){
    if (err) {
      console.error(err);
      process.exit(1);
    }

    var publicSubnets = data.filter(function(net){
      return net.public == true;
    });

    var publicSubnetIdArray = publicSubnets.map(function(netObject){
      return netObject.id;
    });

    //Throw on a random subnet in the array
    var randomSubnet = publicSubnetIdArray[Math.floor(Math.random() * publicSubnetIdArray.length)];

    var config = {
      ami: program.ami,
      type: program.type,
      version: program.version,
      vpc: program.vpc,
      subnet: randomSubnet
    };

    console.log('Creating CF Version', program.version);
    tenantMgmt.create(AWS, stack, config, function(err, stack) {
      if (err) {
        console.error(err);
        process.exit(1);
      }
    });
  });

});
