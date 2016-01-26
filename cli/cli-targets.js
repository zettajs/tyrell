var program = require('commander');
var AWS = require('aws-sdk'); 
var targets = require('./lib/targets');
var stacks = require('./lib/stacks');

AWS.config.update({region: 'us-east-1'});

program
  .command('create', 'create a new version from ami')
  .command('remove', 'remove version')
  .command('scale', 'scale targets ASG')
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

  targets.list(AWS, name, function(err, results) {
    if (err) {
      console.error(err);
      process.exit(1);
    }

    console.log(['Version',
                 'ASG Min/Max',
                 'Instances',
                 'AMI ID',
                 'Target Version'].join('\t')
                );

    results.forEach(function(v) {
      console.log([v.AppVersion,
                   v.ZettaAutoScale.MinSize + '/' + v.ZettaAutoScale.MaxSize,
                   v.ZettaAutoScale.Instances.length + '/' + v.ZettaAutoScale.DesiredCapacity,
                   v.AMI.ImageId + ':' + new Date(v.AMI.CreationDate).toDateString(),
                   v.AMI.Tags['versions:zetta-target-server']
                  ].join('\t'));
    });
  });

});
