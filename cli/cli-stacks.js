var program = require('commander');
var AWS = require('aws-sdk'); 
var stacks = require('./lib/stacks');

AWS.config.update({region: 'us-east-1'});

program
  .command('create', 'create zetta stack')
  .command('remove', 'remove zetta stack')
  .command('update', 'update zetta stack')
  .command('merge [stack]', 'merge s3 buckets from one stack into another')
  .parse(process.argv)

if (program.args.length) {
  return;
}

stacks.list(AWS, function(err, stacks) {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  console.log(['Stack Name',
               'Key Pair',
               'Tyrell Version',
               'Discovery URL'].join('\t'));
  
  stacks.forEach(function(stack) {
    var tyrellVersionTag = stack.Tags.filter(function(t) { return t.Key === 'versions:tyrell'})[0];
    console.log([stack.StackName,
                 stack.Parameters['KeyPair'],
                 (tyrellVersionTag) ? tyrellVersionTag.Value : 'N/A',
                 stack.Parameters['DiscoveryUrl'] || 'N/A'].join('\t')
               );
  })
});

/*
cli versions delete [version]
cli versions scale [version] [n]
*/

