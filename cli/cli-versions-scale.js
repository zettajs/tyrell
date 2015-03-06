var program = require('commander');
var AWS = require('aws-sdk'); 
var versions = require('./lib/versions');
var stacks = require('./lib/stacks');

AWS.config.update({region: 'us-east-1'});

program
  .option('-s, --size <cluster stize>', 'Size of Autoscale group.', null)
  .parse(process.argv);

var name = program.args[0];
if (!name) {
  program.help();
  process.exit(1);
}

var versionId = program.args[1];
if (!versionId) {
  program.help();
  process.exit(1);
}

if (program.size === null) {
  program.help();
  process.exit(1);
}

stacks.get(AWS, name, function(err, stack) {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  versions.list(AWS, name, function(err, results) {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    
    var version = results.filter(function(version) {
      return (version.AppVersion === versionId);
    })[0];

    if (!version) {
      console.error('Failed to find version with id', versionId);
      process.exit(1);
    }
    
    versions.scale(AWS, version.Resources['ZettaAutoScale'].PhysicalResourceId, program.size, function(err) {
      if (err) {
        console.error(err);
        process.exit(1);
      }
    });

  });
});
