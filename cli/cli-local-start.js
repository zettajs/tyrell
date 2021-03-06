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

// link-metrics-01 -> 172.17.8.101
// link-target-01  -> 172.17.8.102
// link-router-01  -> 172.17.8.103

var configs = {
  router: {
    'ZETTA_VERSION': crypto.randomBytes(6).toString('hex'),
    'ZETTA_STACK': 'vagrant',
    'INFLUXDB_HOST': 'http://172.17.8.101:8086',
    'ROUTER_MEMORY_LIMIT': '0'
  },
  target: {
    'ZETTA_VERSION': version,
    'ZETTA_STACK': 'vagrant',
    'INFLUXDB_HOST': 'http://172.17.8.101:8086',
    'ZETTA_DEVICE_DATA_QUEUE': 'http://172.17.8.102:9324/queue/device-data',
    'ZETTA_USAGE_QUEUE': 'http://172.17.8.102:9324/queue/zetta-usage',
    'MQTT_INTERNAL_BROKER_URL': 'mqtt://172.17.8.103:2883',
    'INFLUX_DATABASE': 'deviceData',
    'TARGET_MEMORY_LIMIT': '0',
    'TENANT_MGMT_MEMORY_LIMIT': '0'
  },
  metrics: {
    'ZETTA_VERSION': crypto.randomBytes(6).toString('hex'),
    'ZETTA_STACK': 'vagrant',
    'INFLUXDB_HOST': 'http://172.17.8.101:8086'
  },
  mqttbroker: {
    'ZETTA_VERSION': crypto.randomBytes(6).toString('hex'),
    'ZETTA_STACK': 'vagrant',
    'INFLUXDB_HOST': 'http://172.17.8.101:8086',
    'CREDENTIAL_DB_CONNECTION_URL': 'postgres://postgres:mysecretpassword@link-mqttbroker-01/postgres',
    'RABBITMQ_URL': 'amqp://link-mqttbroker-01:5672',
    'CREDENTIAL_API_URL': 'http://link-mqttbroker-01:2000'
  },
  analytics: {
    'ZETTA_VERSION': crypto.randomBytes(6).toString('hex'),
    'ZETTA_STACK': 'vagrant',
    'INFLUXDB_HOST': 'http://172.17.8.101:8086'
  }
};

function generateConfig(cb) {
  DiscoveryUrl(3, function(err, url) {
    if(err) {
      return cb(err);
    }

    Object.keys(configs).forEach(function(type) {
      var template = fs.readFileSync(path.join(__dirname, '../roles/' + type + '/vagrant-user-data.template'));
      var config = template.toString().replace(discoveryToken, url);
      Object.keys(configs[type]).forEach(function(token) {
        config = config.replace('@@' + token + '@@', configs[type][token]);
      });
      fs.writeFileSync(path.join(Vagrant.vagrantPath(), type + '-user-data'), config);
    })

    cb();
  });
}

function startCluster() {
  var vagrant = Vagrant.command(['up'], function(code) {
    if(code !== 0) {
      throw new Error('Non-Zero exit code. Vagrant box not configured.');
    }

    targets.routeVagrant('link-router-01', version, function(err) {
      if (err) {
        throw err;
      }

      var sqs = new AWS.SQS({ region: 'us-east-1',
                              endpoint: 'http://172.17.8.102:9324',
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
