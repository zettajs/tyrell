var program = require('commander');
var fs = require('fs');
var path = require('path');
var discoveryToken = /@@ETCD_DISCOVERY_URL@@/;
var Vagrant = require('./lib/vagrant');
var DiscoveryUrl = require('./lib/get-discovery-url');
var userDataTemplatePath = path.join(Vagrant.vagrantPath(), 'user-data.template');
var userDataPath = path.join(Vagrant.vagrantPath(), 'user-data');


program
  .option('-v, --verbose', 'Display verbose output from starting local cluster.')
  .option('-n, --newconfig', 'Start the cluster with a new configuration.')
  .parse(process.argv);

var verbose = program.verbose;
var newConfig = program.newconfig;

function generateConfig(cb) {
  DiscoveryUrl(function(err, url) {
    if(err) {
      cb(err);  
    }
    var template = fs.readFileSync(userDataTemplatePath);
    var config = template.toString().replace(discoveryToken, url);
    fs.writeFileSync(userDataPath, config); 
    cb();
  }); 
}

function startCluster() {
  var vagrant = Vagrant.command(['up'], function(code) {
    if(code !== 0) {
      throw new Error('Non-Zero exit code. Vagrant box not configured.');  
    }  
  }); 

  if(verbose) {
    vagrant.stdout.on('data', function(chunk) {
      console.log(chunk.toString());  
    });  
  } 
}

if(newConfig) {
  generateConfig(startCluster);
} else {
  startCluster();  
}

