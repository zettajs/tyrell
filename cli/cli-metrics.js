var program = require('commander');
var AWS = require('aws-sdk'); 
var metrics = require('./lib/metrics');

AWS.config.update({region: 'us-east-1'});

program
  .command('create', 'create a new metrics ASG from ami')
  .command('remove', 'remove metrics ASG')
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

metrics.get(AWS, name, function(err, stack) {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  metrics.list(AWS, name, function(err, results) {
    if (err) {
      console.error(err);
      process.exit(1);
    }

    results.forEach(function(v) {
      console.log(v.StackName);
    });
  });
});
