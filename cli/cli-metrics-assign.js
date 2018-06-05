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

var crypto = require('crypto');
var program = require('commander');
var AWS = require('aws-sdk'); 
var metrics = require('./lib/metrics');
var fs = require('fs');

AWS.config.update({region: 'us-east-1'});

program
  .parse(process.argv);


var name = program.args[0];
var subdomain = program.args[1]

if (!name) {
  program.help();
  process.exit(1);
}

if (!subdomain) {
  program.help();
  return program.exit(1);
}

var full = subdomain + '.iot.apigee.net';
var zoneName = 'iot.apigee.net.';

function route(AWS, stack, domain) {
  var route53 = new AWS.Route53();
  metrics.get(AWS, stack, function(err, stack) {
    var publicIp = stack.Resources['MetricsASG'].Instances[0].PublicIpAddress;  
    route53.listHostedZones({}, function(err, data) {
      var found = data.HostedZones.some(function(zone) {
        if(zone.Name === zoneName) {
          var params = {
            HostedZoneId: zone.Id,  
            ChangeBatch: {
              Changes: [
                {
                  Action: 'UPSERT',
                  ResourceRecordSet: {
                    Name: full, 
                    Type: 'A',
                    TTL: 300,
                    ResourceRecords: [
                    { Value: publicIp }  
                    ]  
                  }  
                }
              ]  
            }
          };  

          route53.changeResourceRecordSets(params, function(err) {
            if(err) {
              console.error(err);  
            } else {
              console.log('Subdomain:', subdomain, ' pointing at:', publicIp);  
            }  
          });
        }
      });  
    });
  });
    
}

route(AWS, name, subdomain);
