var program = require('commander');
var AWS = require('aws-sdk'); 
var traffic = require('./lib/traffic');
var versions = require('./lib/versions');
var stacks = require('./lib/stacks');

AWS.config.update({region: 'us-east-1'});

program
  .option('--version <zetta version>', 'Logical version of the zetta asg being deployed', null)
  .option('-k, --keyPair <key_pair>', 'Indentity file for sshing into box.')
  .parse(process.argv);

var name = program.args[0];
if (!name) {
  program.help();
  process.exit(1);
}

if (!program.keyPair) {
  program.help();
  process.exit(1);
}

stacks.get(AWS, name, function(err, stack) {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  
  if (!program.version) {
    traffic.zettaVersion(AWS, name, program.keyPair, function(err, obj) {
      if (err) {
        throw err;
      }
      console.log(obj.version)
    });
    return;
  }
  
  versions.list(AWS, name, function(err, versions) {
    if (err) {
      throw err;
    }
  
    versions = versions.filter(function(version) {
      return version.AppVersion === program.version;
    });

    if (versions.length === 0) {
      console.error('Version does not exist.');
      process.exit(1);
    }

    traffic.setZettaVersion(AWS, name, program.version, program.keyPair, function(err, obj) {
      if (err) {
        throw err;
      }
    });

  });  
});
