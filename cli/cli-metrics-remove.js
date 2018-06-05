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
var program = require('commander');
var AWS = require('aws-sdk'); 
var metrics = require('./lib/metrics');

AWS.config.update({region: 'us-east-1'});

program
  .option('-k, --keyPair <key_pair>', 'If specified will also delete keypair')
  .parse(process.argv);


var name = program.args[0];
if (!name) {
  program.help();
  process.exit(1);
}

var ec2 = new AWS.EC2();
metrics.remove(AWS, name, function(err) {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  if (program.keyPair) {
    ec2.deleteKeyPair({ KeyName: program.keyPair }, function(err, data) {
      if (err) {
        console.error(err);
      }
    });
  }
  console.log('Metrics Stack Removed');
});


