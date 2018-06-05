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
var stacks = require('./lib/stacks');
var databases = require('./lib/databases');

AWS.config.update({region: 'us-east-1'});

program
  .option('--type <instance type>', 'Instance type to use. [db.t2.micro]', 'db.t2.micro')
  .option('-s, --size <size>', 'The size of the database (Gb). [5]', 5)
  .option('--multiAz', 'Enable multiaz for db', false)
  .option('--version <app version>', 'Logical version of the app being deployed', crypto.randomBytes(6).toString('hex'))
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
    
  var config = {
    size: program.size,
    type: program.type,
    version: program.version,
    multiAz: !!program.multiAz
  };

  console.log('Creating CF Version', program.version);
  databases.create(AWS, stack, config, function(err, stack) {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log({ userName: stack.userName, password: stack.password});
  });

});
