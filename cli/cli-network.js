var program = require('commander');
var AWS = require('aws-sdk');
var vpc = require('./lib/vpc');

AWS.config.update({ region: 'us-east-1' });

program
  .command('describe', 'list resources assigned to a network')
  .command('create', 'create a new network')
  .command('remove', 'remove a network')
  .parse(process.argv);

if(program.args.length) {
  return;
}

vpc.list(AWS, function(err, vpcs) {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(['Stack Name', 'VPC ID'].join('\t'));
  vpcs.forEach(function(stack) {
    console.log([stack.StackName, stack.Resources['VPC'].PhysicalResourceId].join('\t'));
  })
})

