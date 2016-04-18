var crypto = require('crypto');
var program = require('commander');
var AWS = require('aws-sdk');
var stacks = require('./lib/stacks');
var targets = require('./lib/targets');
var vpc = require('./lib/vpc');

AWS.config.update({region: 'us-east-1'});

program
  .option('-a, --ami <ami>', 'Existing AMI to use.')
  .option('--type <instance type>', 'Instance type to use. [t2.micro]', 't2.micro')
  .option('-s, --size <cluster stize>', 'Size of Autoscale group. [1]', 1)
  .option('--version <app version>', 'Logical version of the app being deployed', crypto.randomBytes(6).toString('hex'))
  .option('-v, --vpc <vpc>', 'VPC to distribute targets on. Deployed to the private subnets.')
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

    var privateSubnets = data.filter(function(net){
      return net.public == false;
    });

    var subnetIdArray = privateSubnets.map(function(netObject){
      return netObject.id;
    });

    var config = {
      ami: program.ami,
      size: program.size,
      type: program.type,
      version: program.version,
      subnets: subnetIdArray
    };

    console.log('Creating CF Version', program.version);
    targets.create(AWS, stack, config, function(err, stack) {
      if (err) {
        console.error(err);
        process.exit(1);
      }
    });
  });
});
