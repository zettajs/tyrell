var program = require('commander');

program
  .command('elb [stack]', 'update the elb with a router\'s ASG ')
  .command('zetta [stack]', 'update the routers version')
  .command('tenant-mgmt-api [stack]', 'update the tenant mgmt api version')
  .command('credential-api [stack]', 'update the credential api version')
  .command('rabbitmq [stack]', 'update the rabbitmq version')
  .command('mqttbrokers [stack]', 'update the mqttbroker version')
  .command('results [stack]', 'update the results version')
  .command('usage-api [stack]', 'usage api version')
  .parse(process.argv);

if (program.args.length 
    && program.commands.map(function(x) { return x._name; }).indexOf(program.args[0]) > -1 ) {
  return;
}
 
