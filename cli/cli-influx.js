var program = require('commander');
var AWS = require('aws-sdk'); 
var analytics = require('./lib/influx-analytics');

AWS.config.update({region: 'us-east-1'});

program
  .command('create', 'create a new analytics ASG from ami')
  .command('remove', 'remove analytics ASG')
  .command('assign', 'assign a analytics box to a domain')
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
