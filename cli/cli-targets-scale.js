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
var targets = require('./lib/targets');
var stacks = require('./lib/stacks');

AWS.config.update({region: 'us-east-1'});

program
  .option('-s, --size <cluster stize>', 'Size of Autoscale group.', null)
  .parse(process.argv);

var name = program.args[0];
if (!name) {
  program.help();
  process.exit(1);
}

var versionId = program.args[1];
if (!versionId) {
  program.help();
  process.exit(1);
}

if (program.size === null) {
  program.help();
  process.exit(1);
}

stacks.get(AWS, name, function(err, stack) {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  targets.list(AWS, name, function(err, results) {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    
    var version = results.filter(function(version) {
      return (version.AppVersion === versionId);
    })[0];

    if (!version) {
      console.error('Failed to find version with id', versionId);
      process.exit(1);
    }
    
    targets.scale(AWS, version.Resources['ZettaAutoScale'].PhysicalResourceId, program.size, function(err) {
      if (err) {
        console.error(err);
        process.exit(1);
      }
    });

  });
});
