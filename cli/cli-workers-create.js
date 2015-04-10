var crypto = require('crypto');
var program = require('commander');
var AWS = require('aws-sdk'); 
var stacks = require('./lib/stacks');
var workers = require('./lib/workers');

AWS.config.update({region: 'us-east-1'});

program
  .option('-a, --ami <ami>', 'Existing AMI to use.')
  .option('--type <instance type>', 'Instance type to use. [t2.medium]', 't2.medium')
  .option('--version <app version>', 'Logical db version of the app being deployed', crypto.randomBytes(6).toString('hex'))
  .parse(process.argv);


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

  var config = {
    stack: name,
    keyPair: stack.Parameters['KeyPair'],
    discoveryUrl: stack.Parameters['DiscoveryUrl'],
    logentriesToken: stack.Parameters['LogentriesToken'],
    app: {
      ami: program.ami, // cl arg or from previous packer task
      security_groups: [stack.Resources['RouterSecurityGroup'].GroupId].join(','),
      instance_type: program.type,
      version: program.version,
      instanceProfile: stack.Resources['DataWorkerRoleInstanceProfile'].PhysicalResourceId,
      deviceDataQueueUrl: stack.Resources['DeviceDataQueue'].PhysicalResourceId,
      zettaUsageQueueUrl: stack.Resources['ZettaUsageQueue'].PhysicalResourceId,
      zettaUsageS3Bucket: stack.Resources['ZettaUsageBucket'].PhysicalResourceId,
      deviceDataS3Bucket: stack.Resources['DeviceDataBucket'].PhysicalResourceId
    }
  };

  console.log('Creating CF Version', config.app.version);
  workers.create(AWS, config, function(err, stack) {
    if (err) {
      console.error(err);
      process.exit(1);
    }
  });

});
