var program = require('commander');
var AWS = require('aws-sdk'); 
var bastion = require('./lib/bastion');

AWS.config.update({region: 'us-east-1'});

program
  .command('create', 'create a new bastion ASG from ami')
  .command('remove', 'remove bastion ASG')
  .command('assign', 'assign a bastion box to a domain')
  .parse(process.argv);

if (program.args.length 
    && program.commands.map(function(x) { return x._name; }).indexOf(program.args[0]) > -1 ) {
  return;
}
 
var name = program.args[0];
if (!name) {
  program.help();
  process.exit(1);
}

bastion.get(AWS, name, function(err, stack) {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  bastion.list(AWS, name, function(err, results) {
    if (err) {
      console.error(err);
      process.exit(1);
    }

    results.forEach(function(v) {
      console.log(v.StackName);
    });
  });
});
