var program = require('commander');

program
  .command('start', 'start a local CoreOS cluster.')
  .command('update', 'Update docker containers on local boxes.')
  .parse(process.argv);



