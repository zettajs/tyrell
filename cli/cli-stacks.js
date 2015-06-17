var program = require('commander');
var AWS = require('aws-sdk'); 
var stacks = require('./lib/stacks');

AWS.config.update({region: 'us-east-1'});

program
  .command('create', 'create zetta stack')
  .command('remove', 'remove zetta stack')
  .command('update', 'update zetta stack')
  .parse(process.argv)

if (program.args.length) {
  return;
}

stacks.list(AWS, function(err, stacks) {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  stacks.forEach(function(stack) {
    console.log(stack.StackName, stack.Parameters['KeyPair'], stack.Parameters['DiscoveryUrl']);
  })
});

/*
cli versions delete [version]
cli versions scale [version] [n]
*/

