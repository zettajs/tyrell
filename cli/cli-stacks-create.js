var fs = require('fs');
var program = require('commander');
var AWS = require('aws-sdk');
var stacks = require('./lib/stacks');
var provision = require('./lib/provision');
var vpc = require('./lib/vpc');
var coreosamis = require('coreos-amis');


AWS.config.update({region: 'us-east-1'});

program
  .option('-k, --keyPair <key_pair>', 'Specify existing keypair to use when creating future asg.')
  .option('--keyPairPath <path>', 'Specify path to existing key')
  .option('--logToken <token>', 'Specify a log entries token for logging.', '')
  .option('-s, --size <size>', 'Specify cluster size for core services.', 3)
  .option('-t, --type <type>', 'Specify instance type for core services.', 't2.micro')
  .option('--no-provision', 'Do create routers/versions/workers with the latest ami.')
  .option('--device-data-bucket <bucket name>', 'Specify existing device data bucket')
  .option('--zetta-usage-bucket <bucket name>', 'Specify existing device data bucket')
  .option('-v --vpc <vpc>', 'VPC to deploy the stack onto')
  .option('--device-to-cloud', 'Create device to cloud resources.')
  .option('--analytics', 'Create realtime analytics reasources.')
  .option('--analytics-db <database>', 'Name for analytics db', '')
  .parse(process.argv);

var name = program.args[0];

if (!name) {
  program.help();
  process.exit(1);
}

if (program.vpc === undefined) {
  console.error('Must provide vpc');
  process.exit(1);
}


function getSubnets(cb) {
  vpc.subnetsForVpc(AWS, program.vpc, function(err, data){
    if(err) {
      cb(err);
    } else {
      cb(null, data);
    }
  });
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
    keyPairPath = program.keyPairPath;
  } else {
    console.log('Created new KeyPair',  key.KeyName, 'with fingerprint', key.KeyFingerprint, 'wrote to disk (' + key.KeyName + '.pem)');
    fs.writeFileSync(key.KeyName + '.pem', key.KeyMaterial, { mode: 400 });
    keyPairPath = key.KeyName + '.pem';
  }
  getSubnets(function(err, data){
    if (err) {
      console.error(err);
      process.exit(1);
    }

    var privateSubnets = data.filter(function(net){
      return net.public == false;
    });

    var publicSubnets = data.filter(function(net){
      return net.public == true;
    });

    var privateSubnetIdArray = privateSubnets.map(function(netObject){
      return netObject.id;
    });

    var publicSubnetIdArray = publicSubnets.map(function(netObject){
      return netObject.id;
    });

    var tenantMgmtSubnet = publicSubnetIdArray[Math.floor(Math.random() * publicSubnetIdArray.length)];

    if(program.analytics && !program.analyticsDb) {
      program.analyticsDb = 'deviceData';
    }
    var config = {
      stack: name,
      keyPair: key.KeyName,
      logentriesToken: program.logToken,
      size: program.size,
      instanceType: program.type,
      ami: 'ami-cbfdb2a1', // hard code ami to fix issues with etcd support. CoreOS (717.3.0)
      deviceDataBucket: program.deviceDataBucket,
      zettaUsageBucket: program.zettaUsageBucket,
      vpc: program.vpc,
      privateSubnets: privateSubnetIdArray.join(','),
      publicSubnets: publicSubnetIdArray.join(','),
      deviceToCloud: program.deviceToCloud,
      analytics: program.analytics,
      analyticsDb: program.analyticsDb
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

        var opts = {
          stack: name,
          keyPair: keyPairPath,
          vpc: program.vpc,
          privateSubnets: privateSubnetIdArray,
          publicSubnets: publicSubnetIdArray,
          tenantMgmtSubnet: tenantMgmtSubnet,
          deviceToCloud: program.deviceToCloud,
          analytics: program.analytics,
          analyticsDb: program.analyticsDb
        };
        
        // delay 1 minute to allow ec2 instances to be spun up for etcd
        setTimeout(function() {
          provision(AWS, opts, function(err, versions) {
            if (err) {
              console.error('errorcli stacks: ', err);
              process.exit(1);
            }

            console.log('Router Created:', versions.router);
            console.log('Target Created:', versions.target);
            console.log('Worker Created:', versions.worker);
            console.log('Tenant Management Created:', versions.tenantMgmt);
            
            if (program.deviceToCloud) {
              console.log('Database Created:', versions.database);
              console.log('Credential Api Created:', versions.credentialApi);
              console.log('Rabbitmq Created:', versions.rabbitmq);
              console.log('MqttBroker Created:', versions.mqttbroker);
            }
          });
        }, 60000);

      }
    });
  });
});
