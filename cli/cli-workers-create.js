var crypto = require('crypto');
var program = require('commander');
var AWS = require('aws-sdk');
var stacks = require('./lib/stacks');
var workers = require('./lib/workers');
var vpc = require('./lib/vpc');

AWS.config.update({region: 'us-east-1'});

program
  .option('-a, --ami <ami>', 'Existing AMI to use.')
  .option('--type <instance type>', 'Instance type to use. [t2.medium]', 't2.medium')
  .option('--version <app version>', 'Logical db version of the app being deployed', crypto.randomBytes(6).toString('hex'))
  .option('--vpc <vpc>', 'VPC where workers will be deployed on a private subnet.')
  .option('--azs <list>', 'AZs to limit the deployment to.')
  .parse(process.argv);


function getSubnets(cb) {
  vpc.subnetsForVpc(AWS, program.vpc, function(err, data){
    if(err) {
      cb(err);
    } else {
      cb(null, data);
    }
  });
}

var name = program.args[0];
if (!name) {
  program.help();
  process.exit(1);
}

if (!program.ami) {
  program.help();
  return program.exit(1);
}

stacks.get(AWS, name, function(err, stack) {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  getSubnets(function(err, data){
    if(err) {
      console.error(err);
      program.exit(1);
    }

    var privateSubnets = data.filter(function(net){
      return net.public == false;
    });

    var subnetIdArray = privateSubnets.map(function(netObject){
      return netObject.id;
    });
    var config = {
      version: program.version,
      type: program.type,
      ami: program.ami,
      subnets: subnetIdArray.join(',')
    };

    console.log('Creating CF Version', program.version);
    workers.create(AWS, stack, config, function(err, stack) {
      if (err) {
        console.error(err);
        process.exit(1);
      }
    });
  });
});
