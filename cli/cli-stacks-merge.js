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
var stacks = require('./lib/stacks');

AWS.config.update({region: 'us-east-1'});

program
  .option('-t, --type <type>', 'Specify instance type for core services.', 't2.micro')
  .parse(process.argv);

var oldName = program.args[0];
if (!oldName) {
  program.help();
  process.exit(1);
}

var newName = program.args[1];
if (!newName) {
  program.help();
  process.exit(1);
}

stacks.merge(AWS, oldName, newName, function(err) {
  if (err) {
    console.error(err);
    process.exit(1);
  }
});

