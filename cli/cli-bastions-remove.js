var fs = require('fs');
var program = require('commander');
var AWS = require('aws-sdk'); 
var bastions = require('./lib/bastions');

AWS.config.update({region: 'us-east-1'});

program
  .option('-k, --keyPair <key_pair>', 'If specified will also delete keypair')
  .parse(process.argv);


var name = program.args[0];
if (!name) {
  program.help();
  process.exit(1);
}

var ec2 = new AWS.EC2();
bastions.remove(AWS, name, function(err) {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  if (program.keyPair) {
    ec2.deleteKeyPair({ KeyName: program.keyPair }, function(err, data) {
      if (err) {
        console.error(err);
      }
    });
  }
  console.log('Bastions Stack Removed');
});



