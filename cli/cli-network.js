var program = require('commander');
var AWS = require('aws-sdk');
var amis = require('./lib/amis');

AWS.config.update({ region: 'us-east-1' });

program
  .command('describe', 'list resources assigned to a network')
  .command('create', 'create a new network')
  .command('remove', 'remove a network')
  .parse(process.argv);

if(program.args.length) {
  return;
}
