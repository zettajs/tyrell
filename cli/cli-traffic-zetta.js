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
var targets = require('./lib/targets');
var stacks = require('./lib/stacks');

AWS.config.update({region: 'us-east-1'});

program
  .option('--target <target version>', 'Logical version of the target asg being deployed', null)
  .option('-k, --keyPair <key_pair>', 'Indentity file for sshing into box.')
  .parse(process.argv);

var name = program.args[0];
if (!name) {
  program.help();
  process.exit(1);
}

if (!program.keyPair) {
  program.help();
  process.exit(1);
}

stacks.get(AWS, name, function(err, stack) {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  
  if (!program.target) {
    traffic.zettaVersion(AWS, name, program.keyPair, function(err, obj) {
      if (err) {
        throw err;
      }
      console.log(obj.version)
    });
    return;
  }
  
  targets.list(AWS, name, function(err, versions) {
    if (err) {
      throw err;
    }
  
    versions = versions.filter(function(version) {
      return version.AppVersion === program.target;
    });

    if (versions.length === 0) {
      console.error('Target does not exist.');
      process.exit(1);
    }

    traffic.setZettaVersion(AWS, name, program.target, program.keyPair, function(err, obj) {
      if (err) {
        throw err;
      }
    });

  });  
});
