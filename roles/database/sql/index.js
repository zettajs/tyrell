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

var fs = require('fs');
var pg = require('pg');

exports.handler = function(event, context) {

  var sqlData = fs.readFileSync('./create_credential_table.sql').toString();

  var connectionString = event.connectionString;

  pg.connect(connectionString, function(error, client, done) {
    if (error) {
      context.fail(error);
      return;
    }
    
    client.query(sqlData, function(error) {
      if (error) {
        context.fail(error);
        return;
      }

      done();
      context.succeed(JSON.stringify({}));
    });
  });
};
