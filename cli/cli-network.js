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
var vpc = require('./lib/vpc');

AWS.config.update({ region: 'us-east-1' });

program
  .command('describe', 'list resources assigned to a network')
  .command('create', 'create a new network')
  .command('remove', 'remove a network')
  .parse(process.argv);

if(program.args.length) {
  return;
}

vpc.list(AWS, function(err, vpcs) {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(['Stack Name', 'VPC ID'].join('\t'));
  vpcs.forEach(function(stack) {
    console.log([stack.StackName, stack.Resources['VPC'].PhysicalResourceId].join('\t'));
  })
})

