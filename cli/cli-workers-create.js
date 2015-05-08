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
    version: program.version,
    type: program.type,
    ami: program.ami
  };

  console.log('Creating CF Version', program.version);
  workers.create(AWS, stack, config, function(err, stack) {
    if (err) {
      console.error(err);
      process.exit(1);
    }
  });
});
