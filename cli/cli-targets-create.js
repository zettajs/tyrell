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
var stacks = require('./lib/stacks');
var targets = require('./lib/targets');
var vpc = require('./lib/vpc');

AWS.config.update({region: 'us-east-1'});

program
  .option('-a, --ami <ami>', 'Existing AMI to use.')
  .option('--type <instance type>', 'Instance type to use. [t2.micro]', 't2.micro')
  .option('-s, --size <cluster stize>', 'Size of Autoscale group. [1]', 1)
  .option('--version <app version>', 'Logical version of the app being deployed', crypto.randomBytes(6).toString('hex'))
  .option('-v, --vpc <vpc>', 'VPC to distribute targets on. Deployed to the private subnets.')
  .option('--analytics', 'Enable analytics')
  .option('--analytics-db <database>', 'Enable influx data collection to specified database.')
  .option('--memory-limit <limit>', 'Limit target docker containers memory.', '0')
  .option('--azs <list>', 'AZs to limit the deployment to.')
  .parse(process.argv);

var name = program.args[0];
if (!name) {
  program.help();
  process.exit(1);
}

var influx = '';
if(program.influx) {
  influx = program.influx;
}

if (!program.ami || !(/ami-*/).test(program.ami)) {
  program.help();
  return program.exit(1);
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

stacks.get(AWS, name, function(err, stack) {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  getSubnets(function(err, data){
    if (err) {
      console.error(err);
      process.exit(1);
    }

    var privateSubnets = data.filter(function(net){
      return net.public == false;
    });

    var subnetIdArray = privateSubnets.map(function(netObject){
      return netObject.id;
    });

    if(program.analytics && !program.analyticsDb) {
      program.analyticsDb = 'deviceData';
    }

    var config = {
      ami: program.ami,
      size: program.size,
      type: program.type,
      version: program.version,
      subnets: subnetIdArray,
      analytics: program.analytics,
      analyticsDb: program.analyticsDb,
      memoryLimit: program.memoryLimit
    };

    console.log('Creating CF Version', program.version);
    targets.create(AWS, stack, config, function(err, stack) {
      if (err) {
        console.error(err);
        process.exit(1);
      }
    });
  });
});
