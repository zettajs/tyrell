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
  .command('elb [stack]', 'update the elb with a router\'s ASG ')
  .command('zetta [stack]', 'update the routers version')
  .command('tenant-mgmt-api [stack]', 'update the tenant mgmt api version')
  .command('credential-api [stack]', 'update the credential api version')
  .command('rabbitmq [stack]', 'update the rabbitmq version')
  .command('mqttbrokers [stack]', 'update the mqttbroker version')
  .command('results [stack]', 'update the results version')
  .command('usage-api [stack]', 'usage api version')
  .parse(process.argv);

if (program.args.length 
    && program.commands.map(function(x) { return x._name; }).indexOf(program.args[0]) > -1 ) {
  return;
}
 
