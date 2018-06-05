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

var https = require('https');
var url = require('url');

var DEFAULT_BASE = 'https://discovery.etcd.io/new';
var DEFAULT_SIZE = 3;

module.exports = function(size, cb) {
  if (typeof size === 'function') {
    cb = size;
    size = DEFAULT_SIZE;
  }

  var urlObj = url.parse(DEFAULT_BASE);
  urlObj.query = { size: size };

  https.get(url.format(urlObj), function(res) {
    if (res.statusCode !== 200) {
      return cb(new Error('Unexpected error code'));
    }
    var body = '';
    res.on('data', function (chunk) {
      body += chunk;
    });
    res.on('end', function() {
      cb(null, body);
    })
  }).on('error', cb);
  
};
