var program = require('commander');

program
  .command('stacks', 'list all stacks, and sub commands')
  .command('versions [stack-name]', 'list zetta versions, and sub commands')
  .command('traffic [stack-name]', 'switch elb traffic to a specific ASG version')
  .parse(process.argv);

if (program.args.length === 0) {
  return program.help();
}
