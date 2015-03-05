var program = require('commander');

program
  .command('stacks', 'list all stacks')
  .command('create [stack-name]', 'create a new zetta-stack')
  .command('delete [stack-name]', 'delete a new zetta-stack')
  .command('deploy [stack-name]', 'deploy zetta in stack')
  .command('versions [stack-name]', 'list zetta versions')
  .command('traffic [stack-name]', 'switch elb traffic to a specific ASG version')
  .parse(process.argv);
