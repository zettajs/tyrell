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
var amis = require('./lib/amis');

AWS.config.update({ region: 'us-east-1' });

program
  .command('create', 'create a new CoreOS image for zetta.')
  .option('--worker', 'Show sqs worker builds')
  .parse(process.argv);

if(program.args.length) {
  return;
}

if (program.worker) {
  amis.listWorker(AWS, function(err, images) {
    if(err) {
      console.error(err);
      process.exit(1);  
    } 
    
    display(images);
  });
} else {
  amis.list(AWS, function(err, images) {
    if(err) {
      console.error(err);
      process.exit(1);  
    } 
    
    display(images);
  });
}


function display(images) {
  images = images.sort(function(a, b) {
    var d1 = a.CreationDate;
    var d2 = b.CreationDate;
    if (d1 > d2) {
      return 1;
    } else if (d2 > d1) {
      return -1;
    } else {
      return 0;
    }
  });

  console.log(['Image ID',
               'Build Date',
               'Virtualization Type',
               'zetta-cloud-proxy',
               'zetta-target-server',
               'tyrell',
              ].join('\t'));
  
  images.forEach(function(image) {
    console.log([image.ImageId,
                 image.CreationDate,
                 (image.VirtualizationType === 'hvm') ? 'hvm' : 'para',
                 image.Tags['versions:zetta-cloud-proxy'],
                 image.Tags['versions:zetta-target-server'],
                 image.Tags['versions:tyrell']
                ].join('\t'));
  });
}
