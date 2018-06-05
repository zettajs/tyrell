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
  .command('create', 'create zetta stack')
  .command('remove', 'remove zetta stack')
  .command('update', 'update zetta stack')
  .command('merge [stack]', 'merge s3 buckets from one stack into another')
  .parse(process.argv)

if (program.args.length) {
  return;
}

stacks.list(AWS, function(err, stacks) {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  console.log(['Stack Name',
               'Key Pair',
               'Tyrell Version',
               'Discovery URL'].join('\t'));
  
  stacks.forEach(function(stack) {
    var tyrellVersionTag = stack.Tags.filter(function(t) { return t.Key === 'versions:tyrell'})[0];
    console.log([stack.StackName,
                 stack.Parameters['KeyPair'],
                 (tyrellVersionTag) ? tyrellVersionTag.Value : 'N/A',
                 stack.Parameters['DiscoveryUrl'] || 'N/A'].join('\t')
               );
  })
});

/*
  cli versions delete [version]
  cli versions scale [version] [n]
*/

