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
var base = 'vagrant';


exports.command = function(vagrantArgs, cb) {
  vagrantPath();
  var vagrant = spawn(base, vagrantArgs);
  vagrant.on('exit', function(code, signal) {
    cb(code);  
  });

  return vagrant;
};

var vagrantPath = exports.vagrantPath = function () {
  process.chdir(__dirname);
  process.chdir('..');
  process.chdir('..'); 
  return process.cwd();
}
