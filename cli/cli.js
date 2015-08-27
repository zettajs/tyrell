var program = require('commander');

program
  .command('stacks', 'list all stacks, and sub commands')
  .command('targets [stack-name]', 'list targets and sub commands')
  .command('routers [stack-name]', 'list routers and sub commands')
  .command('traffic [stack-name]', 'switch elb traffic to a specific router ASG')
  .command('workers [stack-name]', 'sqs data workers')
  .command('tenant-mgmt-api [stack-name]', 'tenant mgmt api')
  .command('builds', 'build a new CoreOS image for zetta.')
  .command('local', 'interact with a local CoreOS cluster.')
  .parse(process.argv);

if (program.args.length === 0) {
  return program.help();
}
