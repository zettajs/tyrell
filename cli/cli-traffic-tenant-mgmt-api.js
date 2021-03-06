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
var tenantMgmt = require('./lib/tenant-mgmt-api');
var stacks = require('./lib/stacks');

AWS.config.update({region: 'us-east-1'});

var DNS_ZONE = process.env.DNS_ZONE;
if (!DNS_ZONE) {
  console.error('Set env var DNS_ZONE to the route53 DNS zone. Eg. iot.company.net')
  process.exit(1);
}

var DefaultZone = DNS_ZONE + '.';

program
  .option('--version <api version>', 'Logical version of the api being deployed', null)
  .option('--no-replace', 'Do not replace any versions.')
  .option('--zone <hosted zone>', 'DNS zone', DefaultZone)
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

  stack.DnsZone = program.zone;

  if (!program.version) {
    // list current version
    traffic.tenantMgmt.get(AWS, stack, function(err, instances) {
      if (err) {
        console.error(err);
        process.exit(1);
      }
      
      instances.forEach(function(instance) {
        console.log(instance.InstanceId, instance.PublicIpAddress, instance.Tags['zetta:tenant-mgmt-api:version'])
      })
    });
    return;
  }

  // deploy new version
  tenantMgmt.list(AWS, name, function(err, versions) {
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

    traffic.tenantMgmt.route(AWS, stack, version, function(err) {
      if (err) {
        console.error(err);
        process.exit(1);
      }
    });
  });
});
