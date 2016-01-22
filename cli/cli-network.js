var program = require('commander');
var AWS = require('aws-sdk');
var amis = require('./lib/amis');

AWS.config.update({ region: 'us-east-1' });

program
  .command('create', 'create a new CoreOS image for zetta.')
  .parse(process.argv);

if(program.args.length) {
  return;
}
