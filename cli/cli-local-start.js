var program = require('commander');
var fs = require('fs');
var crypto = require('crypto');
var path = require('path');
var discoveryToken = /@@ETCD_DISCOVERY_URL@@/;
var versionToken = /@@ZETTA_VERSION@@/;
var Vagrant = require('./lib/vagrant');
var versions = require('./lib/versions');
var DiscoveryUrl = require('./lib/get-discovery-url');

program
  .option('-v, --verbose', 'Display verbose output from starting local cluster.')
  .option('-n, --newconfig', 'Start the cluster with a new configuration.')
  .parse(process.argv);

var verbose = program.verbose;
var newConfig = program.newconfig;
var version = crypto.randomBytes(6).toString('hex');

function generateConfig(cb) {
  DiscoveryUrl(function(err, url) {
    if(err) {
      return cb(err);
    }

    var template = fs.readFileSync(path.join(Vagrant.vagrantPath(), 'zetta-user-data.template'));
    var config = template.toString().replace(discoveryToken, url);
    config = config.replace(versionToken, version);
    fs.writeFileSync(path.join(Vagrant.vagrantPath(), 'zetta-user-data'), config);

    var template = fs.readFileSync(path.join(Vagrant.vagrantPath(), 'router-user-data.template'));
    var config = template.toString().replace(discoveryToken, url);
    fs.writeFileSync(path.join(Vagrant.vagrantPath(), 'router-user-data'), config);
    
    cb();
  });
}

function startCluster() {
  var vagrant = Vagrant.command(['up'], function(code) {
    if(code !== 0) {
      throw new Error('Non-Zero exit code. Vagrant box not configured.');  
    }
    
    versions.routeVagrant('core-03', version, function(err) {
      if (err) {
        throw err;
      }
    });

  }); 

  if(verbose) {
    vagrant.stdout.on('data', function(chunk) {
      process.stdout.write(chunk.toString());  
    });  
  }
}

if(newConfig) {
  generateConfig(startCluster);
} else {
  startCluster();  
}

