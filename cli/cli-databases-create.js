var crypto = require('crypto');
var program = require('commander');
var AWS = require('aws-sdk');
var stacks = require('./lib/stacks');
var databases = require('./lib/databases');

AWS.config.update({region: 'us-east-1'});

program
  .option('--type <instance type>', 'Instance type to use. [db.t2.micro]', 'db.t2.micro')
  .option('-s, --size <size>', 'The size of the database (Gb). [5]', 5)
  .option('--multiAz', 'Enable multiaz for db', false)
  .option('--version <app version>', 'Logical version of the app being deployed', crypto.randomBytes(6).toString('hex'))
  .parse(process.argv);


var name = program.args[0];
if (!name) {
  program.help();
  process.exit(1);
}

stacks.get(AWS, name, function(err, stack) {
  if (err) {
    console.error(err);
    process.exit(1);
  }
    
  var config = {
    size: program.size,
    type: program.type,
    version: program.version,
    multiAz: !!program.multiAz
  };

  console.log('Creating CF Version', program.version);
  databases.create(AWS, stack, config, function(err, stack) {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log({ userName: stack.userName, password: stack.password});
  });

});
