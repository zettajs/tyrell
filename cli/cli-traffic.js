var program = require('commander');
var AWS = require('aws-sdk'); 
var versions = require('./lib/versions');
var stacks = require('./lib/stacks');

AWS.config.update({region: 'us-east-1'});

program
  .command('elb [stack]', 'update the elb with a router\'s ASG ')
  .command('zetta [stack]', 'update the routers version')
  .parse(process.argv);

if (program.args.length 
    && program.commands.map(function(x) { return x._name; }).indexOf(program.args[0]) > -1 ) {
  return;
}
 
