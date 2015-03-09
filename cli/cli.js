var program = require('commander');

program
  .command('stacks', 'list all stacks, and sub commands')
  .command('versions [stack-name]', 'list zetta versions, and sub commands')
  .command('databases [stack-name]', 'list databases versions, and sub commands')
  .command('traffic [stack-name]', 'switch elb traffic to a specific ASG version')
  .command('builds', 'build a new CoreOS image for zetta.')
  .command('local', 'interact with a local CoreOS cluster.')
  .parse(process.argv);

if (program.args.length === 0) {
  return program.help();
}
