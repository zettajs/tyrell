// Copyright 2018 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

var crypto = require('crypto');
var program = require('commander');
var AWS = require('aws-sdk');
var metrics = require('./lib/metrics');
var fs = require('fs');
var vpc = require('./lib/vpc');

AWS.config.update({region: 'us-east-1'});

program
  .option('-a, --ami <ami>', 'Existing AMI to use.')
  .option('--type <instance_type>', 'Instance type to use. [t2.micro]', 't2.micro')
  .option('-s, --size <size>', 'Specify cluster size for metrics stack', '1')
  .option('-k, --keyPair <key_pair>', 'Specify existing keypair to use to create metrics stack')
  .option('-d, --diskSize <size>', 'Specify size of disk in GB', '40')
  .option('-v, --vpc <vpc>', 'Specify a vpc for the metrics stack to be to publicly deployed on.')
  .parse(process.argv);


var name = program.args[0];
if (!name) {
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
    ec2.createKeyPair({KeyName: 'metrics-kp-' + name }, function(err, data) {
      if(err) {
        return cb(err);
      }
      return cb(null, data);
    });
  }
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

  getSubnets(function(err, data){
    if(err) {
      console.error(err);
      program.exit(1);
    }

    var publicSubnets = data.filter(function(net){
      return net.public == true;
    });

    var subnetIdArray = publicSubnets.map(function(netObject){
      return netObject.id;
    });

    var config = {
      stack: name,
      instanceType: program.instanceType,
      ami: program.ami,
      size: program.size,
      instanceType: program.type,
      keyPair: key.KeyName,
      diskSize: program.diskSize,
      vpc: program.vpc,
      subnets: publicSubnets
    };

    metrics.create(AWS, config, function(err, stack) {
      if (err) {
        console.error(err);
        process.exit(1);
      }
    });
  });

});
