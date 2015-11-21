var crypto = require('crypto');
var fs = require('fs');
var AWS = require('aws-sdk'); 
var program = require('commander');
var bastions = require('./lib/bastions');
//var ssh = require('./lib/ssh');

AWS.config.update({region: 'us-east-1'});

program
  .option('-a, --ami <ami>', 'Existing AMI to use.')
  .option('--type <instance_type>', 'Instance type to use. [t2.micro]', 't2.micro')
  .option('-s, --size <size>', 'Specify cluster size for a bastion stack', '1')
  .option('-k, --keyPair <key_pair>', 'Specify existing keypair to use to create a bastion stack')
  .parse(process.argv);


if (!program.keyPair) {
  program.help();
  process.exit(1);
}

if (!program.ami) {
  program.help();
  return program.exit(1);
}

function getKeyPair(cb) {
  var ec2 = new AWS.EC2();
  if(program.keyPair) {
    ec2.describeKeyPairs({KeyNames: [program.keyPair]}, function(err, data){
      if(err) {
        return cb(err);  
      }
      return cb(null, data.KeyPairs[0]);
    });  
  } else {
    ec2.createKeyPair({KeyName: program.keyPair }, function(err, data) {
      if(err) {
        return cb(err);  
      }
      return cb(null, data);
    });  
  } 
}

getKeyPair(function(err, key) {
  if(err) {
    console.error(err);
    program.exit(1);  
  }  

  var keyPairPath = null;
  if(!key.KeyMaterial) {
    console.log('Using existing KeyPair', key.KeyName, 'with fingerprint', key.KeyFingerprint);  
  } else {
    console.log('Created new KeyPair', key.KeyName, 'with fingerprint', key.KeyFingerprint, 'wrote to disk (' + key.KeyName +'.pem)');
    fs.writeFileSync(key.KeyName + '.pem', key.KeyMaterial, {mode: 400});
    keyPairPath = key.KeyName + '.pem';      
  }


  var config = {
    stack: 'bastion',
    instanceType: program.instanceType,
    ami: program.ami,
    size: program.size,
    instanceType: program.type,
    keyPair: key.KeyName 
  };

  bastions.create(AWS, config, function(err, stack) {
    if (err) {
      console.error(err);
      process.exit(1);
    }

    //console.log('Modifying authorized_keys...');
    
    //ssh.
  });
});
