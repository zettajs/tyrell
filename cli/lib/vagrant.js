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
