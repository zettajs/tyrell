var fs = require('fs');
var program = require('commander');
var AWS = require('aws-sdk'); 
var getDiscoveryUrl = require('./lib/get-discovery-url');
var stacks = require('./lib/stacks');

AWS.config.update({region: 'us-east-1'});

program
  .option('-k, --keyPair <key_pair>', 'Specify existing keypair to use when creating future asg.')
  .option('--logToken <token>', 'Specify a log entries token for logging.', '')
  .parse(process.argv);

var name = program.args[0];
if (!name) {
  program.help();
  process.exit(1);
}

function getKeyPair(cb) {
  var ec2 = new AWS.EC2();
  if (program.keyPair) {
    ec2.describeKeyPairs({ KeyNames: [ program.keyPair ] }, function(err, data) {
      if (err) {
        return cb(err);
      }
      return cb(null, data.KeyPairs[0]);
    });
  } else {
    ec2.createKeyPair({ KeyName: 'zetta-kp-' + name }, function(err, data) {
      if (err) {
        return cb(err);
      }
      return cb(null, data);
    });
  }
}

getKeyPair(function(err, key) {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  
  if (!key.KeyMaterial) {
    console.log('Using Existing KeyPair',  key.KeyName, 'with fingerprint', key.KeyFingerprint);
  } else {
    console.log('Created new KeyPair',  key.KeyName, 'with fingerprint', key.KeyFingerprint, 'wrote to disk (' + key.KeyName + '.pem)');
    fs.writeFileSync(key.KeyName + '.pem', key.KeyMaterial);
  }

  getDiscoveryUrl(function(err, url) {
    if (err) {
      console.error(err);
      process.exit(1);
    }  
    
    console.log('Using discovery url: ' + url);
    var config = {
      stack: name,
      discoveryUrl: url,
      keyPair: key.KeyName,
      logentriesToken: program.logToken
    };

    stacks.create(AWS, config, function(err) {
      if (err) {
        console.error(err);
        process.exit(1);
      }
      console.log('stack created');
    });
  });
});




