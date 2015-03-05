var fs = require('fs');
var program = require('commander');
var AWS = require('aws-sdk'); 

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
var cloudformation = new AWS.CloudFormation();

// first remove any ASG associated with stack

cloudformation.deleteStack({ StackName: name }, function(err, data) {
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
});




