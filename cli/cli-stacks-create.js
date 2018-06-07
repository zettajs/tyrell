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

var fs = require('fs');
var crypto = require('crypto');
var program = require('commander');
var AWS = require('aws-sdk');
var stacks = require('./lib/stacks');
var provision = require('./lib/provision');
var vpc = require('./lib/vpc');
var coreosamis = require('coreos-amis');
var influxdb = require('./lib/influxdb');

AWS.config.update({region: 'us-east-1'});

program
  .option('-k, --keyPair <key_pair>', 'Specify existing keypair to use when creating future asg.')
  .option('--keyPairPath <path>', 'Specify path to existing key')
  .option('--logToken <token>', 'Specify a log entries token for logging.', '')
  .option('-s, --size <size>', 'Specify cluster size for core services.', 3)
  .option('-t, --type <type>', 'Specify instance type for core services.', 't2.small')
  .option('--core-os-version [version]', 'CoreOS version to get ami value', '1010.6.0')
  .option('--ami-type [hvm|pv]', 'AWS ami virtualization type', 'hvm')
  .option('--no-provision', 'Do create routers/versions/workers with the latest ami.')
  .option('--device-data-bucket <bucket name>', 'Specify existing device data bucket')
  .option('--zetta-usage-bucket <bucket name>', 'Specify existing device data bucket')
  .option('--influxdb-host <influx host>', 'Metrics influxdb host')
  .option('--influxdb-auth <username:password>', 'Metrics influxdb username:password')
  .option('-v --vpc <vpc>', 'VPC to deploy the stack onto')
  .option('--device-to-cloud', 'Create device to cloud resources.')
  .option('--analytics', 'Create realtime analytics reasources.')
  .option('--analytics-db <database>', 'Name for analytics db', 'deviceData')
  .option('--azs <list>', 'AZs to limit the deployment to.')
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
  vpc.subnetsForVpc(AWS, program.vpc, program.azs, function(err, data){
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


coreosamis()
  .version(program.coreOsVersion)
  .region('us-east-1')
  .get(function(err, results) {
    if (err) {
      console.error('Finding ami:', err);
      return process.exit(1);
    }

    var baseAmi = results[program.amiType]
    if (!baseAmi) {
      console.error('Could not ami matching version or ami type.');
      return process.exit(1);
    }

    console.log('Using', baseAmi, 'for core-services machines.');


    if(program.analytics && !program.analyticsDb) {
      program.analyticsDb = 'deviceData';
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

        function createStack() {
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
        };

        var config = {
          stack: name,
          keyPair: key.KeyName,
          logentriesToken: program.logToken,
          size: program.size,
          instanceType: program.type,
          ami: baseAmi,
          deviceDataBucket: program.deviceDataBucket,
          zettaUsageBucket: program.zettaUsageBucket,
          vpc: program.vpc,
          privateSubnets: privateSubnetIdArray.join(','),
          publicSubnets: publicSubnetIdArray.join(','),
          deviceToCloud: program.deviceToCloud,
          analytics: program.analytics,
          analyticsDb: program.analyticsDb,
          azs: program.azs,
          influxdbHost: '',
          influxdbUsername: '',
          influxdbPassword: ''
        };

        if (program.influxdbHost) {
          var influxdbUsername = 'stack' + crypto.randomBytes(6).toString('hex');
          var influxdbPassword = crypto.randomBytes(24).toString('hex');
          console.log('Creating InfluxDB username/password for stack');
          influxdb.createUser({ host: program.influxdbHost, auth: program.influxdbAuth }, influxdbUsername, influxdbPassword, function(err) {
            if (err) {
              console.error('Failed to create influxdb user', err);
              return process.exit(1);
            }
            config.influxdbHost = program.influxdbHost;
            config.influxdbUsername = influxdbUsername;
            config.influxdbPassword = influxdbPassword;
            createStack(config);
          });
        } else {
          console.log('Metrics disabled.');
          createStack(config);
        }
      });
    });
  });