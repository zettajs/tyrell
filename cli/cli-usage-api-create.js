var crypto = require('crypto');
var program = require('commander');
var AWS = require('aws-sdk');
var stacks = require('./lib/stacks');
var usageApi = require('./lib/usage-api');

AWS.config.update({region: 'us-east-1'});

program
  .option('-a, --ami <ami>', 'Existing AMI to use.')
  .option('--type <instance type>', 'Instance type to use. [t2.micro]', 't2.micro')
  .option('--version <app version>', 'Logical version of the app being deployed', crypto.randomBytes(6).toString('hex'))
  .option('-s, --size <cluster stize>', 'Size of Autoscale group. [1]', 1)
  .option('--memory-limit <limit>', 'Limit usage api container memory.', '0')
  .option('--azs <list>', 'AZs to limit the deployment to.')
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

stacks.get(AWS, name, function(err, stack) {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  var config = {
    ami: program.ami,
    type: program.type,
    version: program.version,
    size: program.size,
    azs: program.azs,
    memoryLimit: program.memoryLimit
  };

  console.log('Creating CF Version', program.version);
  usageApi.create(AWS, stack, config, function(err, stack) {
    if (err) {
      console.error(err);
      process.exit(1);
    }
  });
});
