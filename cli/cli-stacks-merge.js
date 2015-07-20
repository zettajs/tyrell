var program = require('commander');
var AWS = require('aws-sdk'); 
var stacks = require('./lib/stacks');

AWS.config.update({region: 'us-east-1'});

program
  .option('-t, --type <type>', 'Specify instance type for core services.', 't2.micro')
  .parse(process.argv);

var oldName = program.args[0];
if (!oldName) {
  program.help();
  process.exit(1);
}

var newName = program.args[1];
if (!newName) {
  program.help();
  process.exit(1);
}

stacks.merge(AWS, oldName, newName, function(err) {
  if (err) {
    console.error(err);
    process.exit(1);
  }
});

