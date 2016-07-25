var crypto = require('crypto');
var program = require('commander');
var AWS = require('aws-sdk');
var stacks = require('./lib/stacks');
var credentialApi = require('./lib/credential-api');

AWS.config.update({region: 'us-east-1'});

program
  .option('-a, --ami <ami>', 'Existing AMI to use.')
  .option('--type <instance type>', 'Instance type to use. [t2.micro]', 't2.micro')
  .option('--version <app version>', 'Logical version of the app being deployed', crypto.randomBytes(6).toString('hex'))
  .option('-d, --db <database>', 'DB to connect to. Using logical id')
  .option('-s, --size <cluster stize>', 'Size of Autoscale group. [1]', 1)
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

if (!program.db) {
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
    dbVersion: program.db,
    size: program.size,
    azs: program.azs
  };

  console.log('Creating CF Version', program.version);
  credentialApi.create(AWS, stack, config, function(err, stack) {
    if (err) {
      console.error(err);
      process.exit(1);
    }
  });
});
