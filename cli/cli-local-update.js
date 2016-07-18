var program = require('commander');
var Vagrant = require('./lib/vagrant');
var async = require('async');
program
  .option('-v, --verbose', 'Display verbose output from starting local cluster.')
  .parse(process.argv);

var component = program.args[0] || null;

function runOnBox(box, cmd, cb) {
  var run = Vagrant.command(['ssh', box, '--', cmd], function(code) {
    if(code !== 0) {
      return cb(new Error('Non-Zero exit code.'));
    }
    cb();
  });

  if (program.verbose) {
    run.stdout.on('data', function(chunk) {
      process.stdout.write(chunk.toString());  
    });

    run.stderr.on('data', function(chunk) {
      process.stderr.write(chunk.toString());  
    });
  }

  return run;
}

var targetDockerCmd = 'docker build -t zetta/link-zetta-target /home/core/target/';
var targetRestartCmd = 'sudo systemctl restart zetta-target@{3001..3003}.service';
var proxyDockerCmd = 'docker build -t zetta/link-router /home/core/proxy/';
var proxyRestartCmd = 'sudo systemctl restart zetta-proxy.service';
var tenantMgmtDockerCmd = 'docker build -t zetta/link-tenant-mgmt-api /home/core/tenant-mgmt/';
var tenantMgmtRestartCmd = 'sudo systemctl restart link-tenant-mgmt-api.service';

var tasks = [];

var updateServices = function(callback) {
  async.each(['link-router-01', 'link-target-01', 'link-metrics-01'], function(box, next) {
    runOnBox(box, 'sudo cp /home/core/services/* /etc/systemd/system/', function(err) {
      if (err) {
        return next(err);
      }
      runOnBox(box, 'sudo systemctl daemon-reload', next);    
    });
  }, callback);
};

var updateTargets = function(callback) {
  async.each(['link-target-01'], function(box, next) {
    runOnBox(box, targetDockerCmd, function(err) {
      if (err) {
        return next(err);
      }
      runOnBox(box, targetRestartCmd, next);
    });
  }, callback);
};

var updateTenantMgmt = function(callback) {
  async.each(['link-target-01'], function(box, next) {
    runOnBox(box, tenantMgmtDockerCmd, function(err) {
      if (err) {
        return next(err);
      }
      runOnBox(box, tenantMgmtRestartCmd, next);
    });
  }, callback);
};

var updateRouters = function(callback) {
  async.each(['link-router-01'], function(box, next) {
    runOnBox(box, proxyDockerCmd, function(err) {
      if (err) {
        return next(err);
      }
      runOnBox(box, proxyRestartCmd, next);
    });
  }, callback);
};


if (!component || component == 'services') {
  tasks.push(updateServices);
}

if (!component || component == 'target') {
  tasks.push(updateTargets);
}

if (!component || component == 'proxy') {
  tasks.push(updateRouters);
}

if (!component || component == 'tenant-mgmt') {
  tasks.push(updateTenantMgmt);
}

async.series(tasks, function(err) {
  if (err) {
    throw err;
  }
});
