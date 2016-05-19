var program = require('commander');
var fs = require('fs');
var crypto = require('crypto');
var path = require('path');
var discoveryToken = /@@ETCD_DISCOVERY_URL@@/;
var versionToken = /@@ZETTA_VERSION@@/;
var Vagrant = require('./lib/vagrant');
var targets = require('./lib/targets');
var DiscoveryUrl = require('./lib/get-discovery-url');
var AWS = require('aws-sdk');

program
  .option('-v, --verbose', 'Display verbose output from starting local cluster.')
  .option('-n, --newconfig', 'Start the cluster with a new configuration.')
  .parse(process.argv);

var verbose = program.verbose;
var newConfig = program.newconfig;
var version = crypto.randomBytes(6).toString('hex');

function generateConfig(cb) {
  DiscoveryUrl(function(err, url) {
    if(err) {
      return cb(err);
    }

    var template = fs.readFileSync(path.join(__dirname, '../roles/target/vagrant-user-data.template'));
    var config = template.toString().replace(discoveryToken, url);
    config = config.replace(versionToken, version);
    config = config.replace(/@@ZETTA_DEVICE_DATA_QUEUE@@/, 'http://core-01:9324/queue/device-data');
    config = config.replace(/@@ZETTA_USAGE_QUEUE@@/, 'http://core-01:9324/queue/zetta-usage');
    config = config.replace(/@@MQTT_INTERNAL_BROKER_URL@@/, 'mqtt://core-03:2883');
    fs.writeFileSync(path.join(Vagrant.vagrantPath(), 'target-user-data'), config);

    var template = fs.readFileSync(path.join(__dirname, '../roles/router/vagrant-user-data.template'));
    
    var config = template.toString().replace(discoveryToken, url);
    config = config.replace(/@@CREDENTIAL_DB_CONNECTION_URL@@/, 'postgres://postgres:mysecretpassword@core-03/postgres');
    config = config.replace(/@@RABBITMQ_URL@@/, 'amqp://core-03:5672');
    config = config.replace(/@@CREDENTIAL_API_URL@@/, 'http://core-03:2000');
    fs.writeFileSync(path.join(Vagrant.vagrantPath(), 'router-user-data'), config);
    
    var template = fs.readFileSync(path.join(__dirname, '../roles/analytics/vagrant-user-data.template'));
    var config = template.toString().replace(discoveryToken, url);
    fs.writeFileSync(path.join(Vagrant.vagrantPath(), 'analytics-user-data'), config);


    cb();
  });
}

function startCluster() {
  var vagrant = Vagrant.command(['up'], function(code) {
    if(code !== 0) {
      throw new Error('Non-Zero exit code. Vagrant box not configured.');
    }

    targets.routeVagrant('core-03', version, function(err) {
      if (err) {
        throw err;
      }

      var sqs = new AWS.SQS({ region: 'us-east-1',
                              endpoint: 'http://core-01:9324',
                              accessKeyId: 'key',
                              secretAccessKey: 'secret'
                            });

      sqs.createQueue({ QueueName: 'device-data' }, function(err, data) {
        if (err) console.error(err);
      });
      sqs.createQueue({ QueueName: 'zetta-usage' }, function(err, data) {
        if (err) console.error(err);
      });

    });

  });

  if(verbose) {
    vagrant.stdout.on('data', function(chunk) {
      process.stdout.write(chunk.toString());
    });
  }

  vagrant.stderr.on('data', function(chunk) {
    process.stderr.write(chunk.toString());
  });
}

if(newConfig) {
  generateConfig(startCluster);
} else {
  startCluster();
}
