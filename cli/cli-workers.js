var program = require('commander');
var AWS = require('aws-sdk'); 
var workers = require('./lib/workers');
var stacks = require('./lib/stacks');

AWS.config.update({region: 'us-east-1'});

program
  .command('create', 'create a new sqs worker ASG from ami')
  .command('remove', 'remove sqs worker ASG version')
  .command('scale', 'scale sqs worker ASG')
  .parse(process.argv);

if (program.args.length 
    && program.commands.map(function(x) { return x._name; }).indexOf(program.args[0]) > -1 ) {
  return;
}
 
var name = program.args[0];
if (!name) {
  program.help();
  process.exit(1);
}

stacks.get(AWS, name, function(err, stack) {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  workers.list(AWS, name, function(err, results) {
    if (err) {
      console.error(err);
      process.exit(1);
    }

    console.log(['Version', 'AMI ID', 'Worker Version'].join('\t'))
    results.forEach(function(v) {
      
      console.log([v.AppVersion,
                   v.AMI.ImageId + ':' + new Date(v.AMI.CreationDate).toDateString(),
                   v.AMI.Tags['versions:zetta-device-data-worker']
                  ].join('\t'));
    });
  });
});
