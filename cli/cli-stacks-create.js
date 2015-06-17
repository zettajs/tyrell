var fs = require('fs');
var program = require('commander');
var AWS = require('aws-sdk'); 
var getDiscoveryUrl = require('./lib/get-discovery-url');
var stacks = require('./lib/stacks');
var provision = require('./lib/provision');
var coreosamis = require('coreos-amis');

AWS.config.update({region: 'us-east-1'});

program
  .option('-k, --keyPair <key_pair>', 'Specify existing keypair to use when creating future asg.')
  .option('--logToken <token>', 'Specify a log entries token for logging.', '')
  .option('-s, --size <size>', 'Specify cluster size for core services.', 3)
  .option('-t, --type <type>', 'Specify instance type for core services.', 't2.micro')
  .option('--no-provision', 'Do create routers/versions/workers with the latest ami.')
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
  
  var keyPairPath = null;
  if (!key.KeyMaterial) {
    console.log('Using Existing KeyPair',  key.KeyName, 'with fingerprint', key.KeyFingerprint);
  } else {
    console.log('Created new KeyPair',  key.KeyName, 'with fingerprint', key.KeyFingerprint, 'wrote to disk (' + key.KeyName + '.pem)');
    fs.writeFileSync(key.KeyName + '.pem', key.KeyMaterial, { mode: 400 });
    keyPairPath = key.KeyName + '.pem';
  }

  getDiscoveryUrl(function(err, url) {
    if (err) {
      console.error(err);
      process.exit(1);
    }  
    
    console.log('Using discovery url: ' + url);

    coreosamis()
      .channel('stable')
      .region('us-east-1')
      .get(function(err, ami) {
        if (err) {
          console.error(err);
          process.exit(1);
        }

        var config = {
          stack: name,
          discoveryUrl: url,
          keyPair: key.KeyName,
          logentriesToken: program.logToken,
          size: program.size,
          instanceType: program.type,
          ami: ami.hvm
        };

        stacks.create(AWS, config, function(err) {
          if (err) {
            console.error(err);
            process.exit(1);
          }
          
          console.log('Stack Created');
          if (program.provision) {
            console.log('Provisioning Default Stack');

            if (!keyPairPath) {
              console.log('Cannot provision without keyPairPath');
              return;
            }

            // delay 1 minute to allow ec2 instances to be spun up for etcd
            setTimeout(function() {
              provision(AWS, { stack: name, keyPair: keyPairPath }, function(err, versions) {
                if (err) {
                  console.error('errorcli stacks: ', err);
                  process.exit(1);
                }
                
                console.log('Router Created:', versions.router);
                console.log('Target Created:', versions.target);
                console.log('Worker Created:', versions.worker);
              });
            }, 60000);

          }
        });
      });
  });
});




