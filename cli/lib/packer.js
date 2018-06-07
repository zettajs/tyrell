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

var spawn = require('child_process').spawn;
var http = require('http');
var base = 'packer';

function changeToPackerDirectory() {
  process.chdir(__dirname);
  process.chdir('..');
  process.chdir('..');
  process.chdir('packer');
}

exports.command = function(vagrantArgs, cb) {
  changeToPackerDirectory();
  var packer = spawn(base, vagrantArgs);
  packer.on('close', function(code, signal) {
    cb(code);  
  });

  return packer;
};

exports.packerPath = function() {
  changeToPackerDirectory();
  return process.cwd();  
};

exports.isoMd5 = function(version, cb) {
  var isoDigestLink = 'http://stable.release.core-os.net/amd64-usr/' + version + '/coreos_production_iso.DIGESTS';
  http.get(isoDigestLink, function(res) {
    if(res.statusCode !== 200) {
      cb(new Error('Cannot retrieve DIGESTS file.'));  
    } 

    var buf = [];

    res.on('data', function(chunk) {
      buf.push(chunk);  
    });

    res.on('end', function() {
      var file = buf.toString();
      var lines = file.split('\n');
      var md5Line = lines[1].split(' ');;
      var md5 = md5Line[0];
      cb(null, md5);
    });
  });
};
