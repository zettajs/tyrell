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
var AWS = require('aws-sdk'); 
var traffic = require('./lib/traffic');
var usageApi = require('./lib/usage-api');
var stacks = require('./lib/stacks');

AWS.config.update({region: 'us-east-1'});

program
  .option('--version <router version>', 'Logical version of the credential being deployed', null)
  .option('--no-replace', 'Do not replace any versions.')
  .parse(process.argv);

var name = program.args[0];
if (!name) {
  program.help();
  process.exit(1);
}

stacks.get(AWS, name, function(err, stack) {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  if (!program.version) {
    // list current version
    traffic.list(AWS, stack.Resources['UsageAPIELB'].PhysicalResourceId, function(err, instances) {
      if (err) {
        console.error(err);
        process.exit(1);
      }
      console.log('InstanceId ElbState  State   Version      AutoScaleGroup')
      instances.forEach(function(instance) {
        console.log(instance.InstanceId, instance.ELBState, instance.State.Name, instance.Tags['zetta:usage-api:version'], instance.Tags['aws:autoscaling:groupName'])
      });
    });
    return;
  }


  // deploy new version
  usageApi.list(AWS, name, function(err, versions) {
    if (err) {
      console.error(err);
      process.exit(1);
    }

    var version = versions.filter(function(version) {
      return (version.AppVersion === program.version);
    })[0];

    if (!version) {
      console.error('Failed to find version with id', program.version);
      process.exit(1);
    }
    
    var opts = { 
      version: version,
      replace: program.replace,
      elbName: stack.Resources['UsageAPIELB'].PhysicalResourceId,
      stack: name
    };

    traffic.routeUsageApi(AWS, opts, function(err) {
      if (err) {
        console.error(err);
        process.exit(1);
      }
    });
  });
});
