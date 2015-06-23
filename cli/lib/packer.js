var spawn = require('child_process').spawn;
var http = require('http');
var base = 'packer';
var isoDigestLink = 'http://stable.release.core-os.net/amd64-usr/current/coreos_production_iso.DIGESTS';

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

exports.isoMd5 = function(cb) {
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
