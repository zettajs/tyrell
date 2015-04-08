var program = require('commander');
var AWS = require('aws-sdk'); 
var routers = require('./lib/routers');
var stacks = require('./lib/stacks');

AWS.config.update({region: 'us-east-1'});

program
  .command('create', 'create a new router ASG from ami')
  .command('remove', 'remove router ASG version')
  .command('scale', 'scale router ASG')
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

  routers.list(AWS, name, function(err, results) {
    if (err) {
      console.error(err);
      process.exit(1);
    }

    results.forEach(function(v) {
      console.log(v.AppVersion,
                  v.StackName,
                  v.RouterAutoScale.Instances.length + '/' + v.RouterAutoScale.DesiredCapacity,
                  v.RouterAutoScale.AddToLoadBalancer
                 );
    });
  });

});
