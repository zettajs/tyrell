var program = require('commander');
var Vagrant = require('./lib/vagrant');
var async = require('async');
program
  .option('-v, --verbose', 'Display verbose output from starting local cluster.')
  .parse(process.argv);

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

var targetDockerCmd = 'docker build -t zetta/zetta-target-server /home/core/target/';
var targetRestartCmd = 'sudo systemctl restart zetta-target@{3001..3003}.service';
var proxyDockerCmd = 'docker build -t zetta/zetta-cloud-proxy /home/core/proxy/';
var proxyRestartCmd = 'sudo systemctl restart zetta-proxy.service';

async.each(['core-01', 'core-02'], function(box, next) {
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

async.each(['core-03'], function(box, next) {
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


