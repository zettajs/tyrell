var program = require('commander');
var AWS = require('aws-sdk'); 
var traffic = require('./lib/traffic');
var targets = require('./lib/targets');
var stacks = require('./lib/stacks');

AWS.config.update({region: 'us-east-1'});

program
  .option('--target <target version>', 'Logical version of the target asg being deployed', null)
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
  
  if (!program.target) {
    traffic.zettaVersion(AWS, name, program.keyPair, function(err, obj) {
      if (err) {
        throw err;
      }
      console.log(obj.version)
    });
    return;
  }
  
  target.list(AWS, name, function(err, versions) {
    if (err) {
      throw err;
    }
  
    versions = versions.filter(function(version) {
      return version.AppVersion === program.target;
    });

    if (versions.length === 0) {
      console.error('Target does not exist.');
      process.exit(1);
    }

    traffic.setZettaVersion(AWS, name, program.target, program.keyPair, function(err, obj) {
      if (err) {
        throw err;
      }
    });

  });  
});
