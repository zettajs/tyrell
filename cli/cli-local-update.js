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


if (!component || component == 'services') {
  async.each(['link-router-01', 'link-target-01', 'link-metrics-01'], function(box, next) {
    runOnBox(box, 'sudo cp /home/core/services/* /etc/systemd/system/', function(err) {
      if (err) {
        return next(err);
      }
      runOnBox(box, 'sudo systemctl daemon-reload', next);    
    });
  }, function(err) {
    if (err) {
      throw err;
    }
  });
}

if (!component || component == 'target') {
  async.each(['link-target-01'], function(box, next) {
    runOnBox(box, targetDockerCmd, function(err) {
      if (err) {
        return next(err);
      }
      runOnBox(box, targetRestartCmd, next);
    });
  }, function(err) {
    if (err) {
      throw err;
    }
  });
}

if (!component || component == 'proxy') {
  async.each(['link-router-01'], function(box, next) {
    runOnBox(box, proxyDockerCmd, function(err) {
      if (err) {
        return next(err);
      }
      runOnBox(box, proxyRestartCmd, next);
    });
  }, function(err) {
    if (err) {
      throw err;
    }
  });
}
