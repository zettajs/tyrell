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

program
  .command('stacks', 'list all stacks, and sub commands')
  .command('targets [stack-name]', 'list targets and sub commands')
  .command('routers [stack-name]', 'list routers and sub commands')
  .command('bastion [stack-name]', 'list bastion and sub commands')
  .command('traffic [stack-name]', 'switch elb traffic to a specific router ASG')
  .command('workers [stack-name]', 'sqs data workers')
  .command('tenant-mgmt-api [stack-name]', 'tenant mgmt api')
  .command('credential-api [stack-name]', 'credential api')
  .command('databases [stack-name]', 'databases')
  .command('rabbitmq [stack-name]', 'rabbitmq')
  .command('mqttbrokers [stack-name]', 'mqtt brokers')
  .command('builds', 'build a new CoreOS image for zetta.')
  .command('local', 'interact with a local CoreOS cluster.')
  .command('network', 'create a new VPC network.')
  .parse(process.argv);

if (program.args.length === 0) {
  return program.help();
}
