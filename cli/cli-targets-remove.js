var program = require('commander');
var AWS = require('aws-sdk'); 
var targets = require('./lib/targets');
var stacks = require('./lib/stacks');

AWS.config.update({region: 'us-east-1'});

program
  .parse(process.argv);

var name = program.args[0];
if (!name) {
  program.help();
  process.exit(1);
}

var deleteVersion = program.args[1];
if (!deleteVersion) {
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
    
    var version = results.filter(function(version) {
      return (version.AppVersion === deleteVersion);
    })[0];

    if (!version) {
      console.error('Failed to find version with id', deleteVersion);
      process.exit(1);
    }
    
    targets.remove(AWS, version.StackName, function(err) {
      if (err) {
        console.error(err);
        process.exit(1);
      }
    });
  });
});
