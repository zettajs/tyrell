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

var http = require('http');
var url = require('url');
var querystring = require('querystring');

module.exports.removeUser = function(opts, username, callback) {
  var q = 'DROP USER ' + username;
  query(opts, q, callback);
};

module.exports.createUser = function(opts, username, password, callback) {
  var q = 'CREATE USER ' + username + ' WITH PASSWORD \'' + password + '\'; GRANT WRITE ON telegraf TO ' + username;
  query(opts, q, callback);
};

module.exports.createUsageApiUser = function(opts, username, password, callback) {
  var q = 'CREATE USER ' + username + ' WITH PASSWORD \'' + password + '\'; GRANT READ ON linkusage TO ' + username;
  query(opts, q, callback);
};

function query(opts, query, callback) {
  var postData = querystring.stringify({
    'q' : query
  });

  var parsed = url.parse(opts.host);
  var httpOpts = {
    hostname: parsed.hostname,
    port: parsed.port,
    protocol: parsed.protocol,
    auth: opts.auth,
    path: '/query',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  var req = http.request(httpOpts, function(res) {
    if (res.statusCode !== 200) {
      return callback(new Error('Non 200 status code'));
    }
    
    return callback();
  });
  req.once('error', callback);
  req.end(postData);
}
