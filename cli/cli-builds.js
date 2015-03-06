var program = require('commander');

program
  .command('create', 'create a new CoreOS image for zetta.')
  .parse(process.argv);

