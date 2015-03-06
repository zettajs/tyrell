var program = require('commander');
var AWS = require('aws-sdk'); 
var versions = require('./lib/versions');
var stacks = require('./lib/stacks');

AWS.config.update({region: 'us-east-1'});

program
  .parse(process.argv);

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


  versions.list(AWS, name, function(err, versions) {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    
    var version = versions.filter(function(version) {
      return (version.AppVersion === program.version);
    })[0];

    if (!version) {
      console.error('Failed to find version with id', program.version);
      process.exit(1);
    }
    
    console.log(version)
    
  });
});
