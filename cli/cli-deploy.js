var crypto = require('crypto');
var program = require('commander');
var AWS = require('aws-sdk'); 
var createZettaCf = require('./lib/create-zetta-cf');
var awsUtils = require('./lib/aws-utils');
var getStack = require('./lib/get-stack');

AWS.config.update({region: 'us-east-1'});

program
  .option('-a, --ami <ami>', 'Existing AMI to use.')
  .option('--type <instance type>', 'Instance type to use. [t2.micro]', 't2.micro')
  .option('-s, --size <cluster stize>', 'Size of Autoscale group. [1]', 1)
  .option('--version <app version>', 'Logical version of the app being deployed', crypto.randomBytes(6).toString('hex'))
  .parse(process.argv);


var name = program.args[0];
if (!name) {
  program.help();
  process.exit(1);
}

if (!program.ami) {
  program.help();
  program.exit(1);
}

getStack(AWS, name, function(err, stack) {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  var config = {
    stack: name,
    keyPair: stack.Parameters['KeyPair'],
    app: {
      ami: program.ami, // cl arg or from previous packer task
      security_groups: [stack.Resources['CoreOsSecurityGroup'].GroupId, stack.Resources['AppSecurityGroup'].GroupId].join(','),
      cluster_size: program.size + '',
      instance_type: program.type,
      load_balancer: stack.Resources['ZettaELB'].PhysicalResourceId,
      version: program.version
    }
  };

  console.log('Creating CF Version', config.app.version);
  createZettaCf(AWS, config, function(err, stack) {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    
    awsUtils.getAsgFromStack(AWS, stack.StackId, function(err, asgName) {
      if (err) {
        console.error(err);
        process.exit(1);
      }

      console.log('Waiting for ASG instances to become avialable');
      awsUtils.asgInstancesAvailable(AWS, asgName, {}, function(err) {
        if (err) {
          console.error(err);
          process.exit(0);
        }
      });
    })
  });
});