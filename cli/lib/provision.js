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
var async = require('async');
var stacks = require('./stacks');
var routers = require('./routers');
var targets = require('./targets');
var workers = require('./workers');
var databases = require('./databases');
var mqttbrokers = require('./mqttbrokers');
var rabbitmq = require('./rabbitmq');
var credentialApi = require('./credential-api');
var tenantMgmt = require('./tenant-mgmt-api');
var usageApi = require('./usage-api');
var amis = require('./amis');
var traffic = require('./traffic');

// Provision deployment with latest amis for router/targets/workers
//  opts.stack - required
//  opts.keyPair - path to key required

//  opts.ami
//  opts.workerAmi
//  opts.vpcId
//  opts.privateSubnets
//  opts.publicSubnets
//  opts.tenantMgmtSubnet
//  opts.routerSize  - Defaults 1
//  opts.routerType  - Defaults t2.micro
//  opts.versionSize - Defaults 1
//  opts.versionType - Defaults t2.micro
//  opts.workerType  - Defaults t2.medium
//  opts.azs - AvailabilityZones to assign to asgs

var DEFAULTS = {
  routerSize: 1, // Number of router instances
  routerType: 'm1.small', // Router types
  versionSize: 3, // number of zetta target instances
  versionType: 'm1.large', // zetta target instances type
  workerType: 'm1.small',
  usageApiType: 'm1.small', // Usage api instance type
  dbSize: 5, //GB
  dbMultiAZ: false,
  dbInstanceType: 'db.t2.micro',
  credentialApiInstanceType: 'm1.small',
  rabbitmqInstanceType: 'm1.small',
  mqttbrokerInstanceType: 'm1.small',
};

module.exports = function(AWS, opts, callback) {

  if (!opts.stack) {
    return callback(new Error('Must provide stack name'));
  }

  Object.keys(DEFAULTS).forEach(function(k) {
    if (opts[k] === undefined) {
      opts[k] = DEFAULTS[k];
    }
  });

  stacks.get(AWS, opts.stack, function(err, stack) {

    if (err) {
      return callback(err);
    }
    async.parallel([
      latestAmi.bind(null, AWS, opts),
      latestWorkerAmi.bind(null, AWS, opts)
    ], function(err, images) {
      if (err) {
        return callback(err);
      }

      var versionKeys = {
        router: crypto.randomBytes(6).toString('hex'),
        target: crypto.randomBytes(6).toString('hex'),
        worker: crypto.randomBytes(6).toString('hex'),
        tenantMgmt: crypto.randomBytes(6).toString('hex'),
        database: crypto.randomBytes(6).toString('hex'),
        credentialApi: crypto.randomBytes(6).toString('hex'),
        rabbitmq: crypto.randomBytes(6).toString('hex'),
        mqttbroker: crypto.randomBytes(6).toString('hex'),
        usageApi: crypto.randomBytes(6).toString('hex')
      };

      var createTasks = [
        function(next) {
          var config = { ami: images[0], size: opts.routerSize, type: opts.routerType, version: versionKeys.router, subnets: opts.privateSubnets, azs: opts.azs  };
          routers.create(AWS, stack, config, next);
        },
        function(next) {
          var config = { ami: images[0], size: opts.versionSize, type: opts.versionType, version: versionKeys.target, subnets: opts.privateSubnets, analyticsDb: opts.analyticsDb, azs: opts.azs };
          targets.create(AWS, stack, config, next);
        },
        function(next) {
          var config = { ami: images[1], type: opts.workerType, version: versionKeys.worker, subnets: opts.privateSubnets.join(','), azs: opts.azs };
          workers.create(AWS, stack, config, next);
        },
        function(next) {
          var config = { ami: images[0], type: opts.versionType, version: versionKeys.tenantMgmt, subnet: opts.tenantMgmtSubnet, vpc: opts.vpc };
          tenantMgmt.create(AWS, stack, config, next);
        },
        function(next) {
          var config = { ami: images[0], type: opts.usageApiType, version: versionKeys.usageApi, azs: opts.azs };
          usageApi.create(AWS, stack, config, next);
        },
        // Add RDS Postgres db if device-to-cloud is enabled
        function(next) {
          if (opts.deviceToCloud !== true) return next();

          var config = { size: opts.dbSize, type: opts.dbInstanceType, version: versionKeys.database, multiAz: opts.dbMultiAZ };
          databases.create(AWS, stack, config, function(err) {
            if (err) {
              return next(err);
            }

            // Create credential-api, need db to be created first
            var config = { ami: images[0], type: opts.credentialApiInstanceType, version: versionKeys.credentialApi, dbVersion: versionKeys.database, size: 1, azs: opts.azs };
            credentialApi.create(AWS, stack, config, next);
          });
        },
        // Add RabbitMQ  if device-to-cloud is enabled
        function(next) {
          if (opts.deviceToCloud !== true) return next();
          var config = { ami: images[0], type: opts.rabbitmqInstanceType, version: versionKeys.rabbitmq, size: 1, azs: opts.azs };
          rabbitmq.create(AWS, stack, config, next);
        },
        // Add mqttbrokers if device-to-cloud is enabled
        function(next) {
          if (opts.deviceToCloud !== true) return next();

          var config = { ami: images[0], type: opts.mqttbrokerInstanceType, version: versionKeys.mqttbroker, size: 1, azs: opts.azs };
          mqttbrokers.create(AWS, stack, config, next);
        }
      ];

      async.parallel(createTasks, function(err) {
        if (err) {
          return callback(err);
        }

        var routeTasks = [
          function(next) {
            routers.list(AWS, opts.stack, function(err, versions) {
              if (err) {
                return next(err);
              }

              var version = versions.filter(function(version) {
                return (version.AppVersion === versionKeys.router);
              })[0];

              setTimeout(function() {
                var config = { stack: opts.stack, version: version, replace: true, elbName: stack.Resources['ZettaELB'].PhysicalResourceId };
                traffic.route(AWS, config, next);
              }, 60000);
            });
          },
          function(next) {
            traffic.setZettaVersion(AWS, opts.stack, versionKeys.target, opts.keyPair, next);
          },
          function(next) {
            tenantMgmt.list(AWS, opts.stack, function(err, versions) {
              if (err) {
                return next(err);
              }

              var version = versions.filter(function(version) {
                return (version.AppVersion === versionKeys.tenantMgmt);
              })[0];

              if (!version) {
                return next(new Error('Unable to find tenant mgmt version'));
              }
              stack.DnsZone = 'iot.apigee.net.';
              traffic.tenantMgmt.route(AWS, stack, version, next);
            });
          },
          // Route rabbitmq if created
          function (next) {
            if (opts.deviceToCloud !== true) return next();
            rabbitmq.list(AWS, opts.stack, function(err, versions) {
              if (err) {
                return next(err);
              }

              var version = versions.filter(function(version) {
                return (version.AppVersion === versionKeys.rabbitmq);
              })[0];

              if (!version) {
                return next(new Error('Unable to find rabbitmq version'));
              }

              var config = { version: version,  elbName: stack.Resources['RabbitMQELB'].PhysicalResourceId, stack: opts.stack };
              traffic.routeRabbitMq(AWS, config, next);
            });
          },
          // Route MqttBrokers if created
          function (next) {
            if (opts.deviceToCloud !== true) return next();
            mqttbrokers.list(AWS, opts.stack, function(err, versions) {
              if (err) {
                return next(err);
              }

              var version = versions.filter(function(version) {
                return (version.AppVersion === versionKeys.mqttbroker);
              })[0];

              if (!version) {
                return next(new Error('Unable to find mqttbroker version'));
              }

              var config = { version: version,  elbName: [stack.Resources['InternalMQTTELB'].PhysicalResourceId, stack.Resources['ExternalMQTTELB'].PhysicalResourceId], stack: opts.stack };
              traffic.routeMqttBroker(AWS, config, next);
            });
          },
          // Route Credential Api if created
          function (next) {
            if (opts.deviceToCloud !== true) return next();

            credentialApi.list(AWS, opts.stack, function(err, versions) {
              if (err) {
                return next(err);
              }

              var version = versions.filter(function(version) {
                return (version.AppVersion === versionKeys.credentialApi);
              })[0];

              if (!version) {
                return next(new Error('Unable to find credential api version'));
              }

              var config = { version: version,  elbName: stack.Resources['CredentialAPIELB'].PhysicalResourceId, stack: opts.stack };
              traffic.routeCredentialApi(AWS, config, next);
            });
          },
          // Route Usage Api if created
          function (next) {
            usageApi.list(AWS, opts.stack, function(err, versions) {
              if (err) {
                return next(err);
              }

              var version = versions.filter(function(version) {
                return (version.AppVersion === versionKeys.usageApi);
              })[0];

              if (!version) {
                return next(new Error('Unable to find usage api version'));
              }

              var config = { version: version,  elbName: stack.Resources['UsageAPIELB'].PhysicalResourceId, stack: opts.stack };
              traffic.routeUsageApi(AWS, config, next);
            });
          }

        ];

        async.parallel(routeTasks, function(err) {
          if (err) {
            console.log('traffic error:', err);
          }
          return callback(err, versionKeys);
        });
      });
    });
  });
};

function latestAmi(AWS, opts, cb) {
  if (typeof opts.ami === 'string' && opts.ami.indexOf('ami-') === 0) {
    return cb(null, opts.ami);
  } else {
    amis.list(AWS, function(err, images) {
      if (err) {
        return cb(err);
      }
      return cb(null, images[images.length - 1].ImageId);
    });
  }
};

function latestWorkerAmi(AWS, opts, cb) {
  if (typeof opts.workerAmi === 'string' && opts.workerAmi.indexOf('ami-') === 0) {
    return cb(null, opts.workerAmi);
  } else {
    amis.listWorker(AWS, function(err, images) {
      if (err) {
        return cb(err);
      }
      return cb(null, images[images.length - 1].ImageId);
    });
  }
};
