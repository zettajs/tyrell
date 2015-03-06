var spawn = require('child_process').spawn;
var base = 'vagrant';

function changeToVagrantDirectory() {
  process.chdir(__dirname);
  process.chdir('..');
  process.chdir('..'); 
}

exports.command = function(vagrantArgs, cb) {
  changeToVagrantDirectory();
  var vagrant = spawn(base, vagrantArgs);
  vagrant.on('close', function(code, signal) {
    cb(code);  
  });

  return vagrant;
};
