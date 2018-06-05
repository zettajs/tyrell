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
var routers = require('./lib/routers');
var stacks = require('./lib/stacks');

AWS.config.update({region: 'us-east-1'});

program
  .command('create', 'create a new router ASG from ami')
  .command('remove', 'remove router ASG version')
  .command('scale', 'scale router ASG')
  .parse(process.argv);

if (program.args.length 
    && program.commands.map(function(x) { return x._name; }).indexOf(program.args[0]) > -1 ) {
  return;
}
 
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

  routers.list(AWS, name, function(err, results) {
    if (err) {
      console.error(err);
      process.exit(1);
    }

    console.log(['Version',
                 'CF Stack Name',
                 'Instances',
                 'ELB Enabled',
                 'AMI ID',
                 'Router Version'
                ].join('\t')
               );    
    results.forEach(function(v) {
      console.log([v.AppVersion,
                   v.StackName,
                   v.RouterAutoScale.Instances.length + '/' + v.RouterAutoScale.DesiredCapacity,
                   v.RouterAutoScale.AddToLoadBalancer,
                   v.AMI.ImageId + ':' + new Date(v.AMI.CreationDate).toDateString(),
                   v.AMI.Tags['versions:zetta-cloud-proxy']
                  ].join('\t')
                 );
    });
  });

});
