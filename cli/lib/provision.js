var crypto = require('crypto');
var async = require('async');
var stacks = require('./stacks');
var routers = require('./routers');
var targets = require('./targets');
var workers = require('./workers');
var amis = require('./amis');
var traffic = require('./traffic');

// Provision deployment with latest amis for router/targets/workers
//  opts.stack - required
//  opts.keyPair - path to key required

//  opts.ami
//  opts.workerAmi
//  opts.routerSize  - Defaults 1
//  opts.routerType  - Defaults t2.micro
//  opts.versionSize - Defaults 1
//  opts.versionType - Defaults t2.micro
//  opts.workerType  - Defaults t2.medium 

module.exports = function(AWS, opts, callback) {

  if (!opts.stack) {
    return callback(new Error('Must provide stack name'));
  }
  
  if (opts.routerSize === undefined) {
    opts.routerSize = 1;
  }
  if (opts.routerType === undefined) {
    opts.routerType = 't2.micro';
  }

  if (opts.versionSize === undefined) {
    opts.versionSize = 1;
  }
  if (opts.versionType === undefined) {
    opts.versionType = 't2.micro';
  }

  if (opts.workerType === undefined) {
    opts.workerType = 't2.medium';
  }

  stacks.get(AWS, opts.stack, function(err, stack) {
    if (err) {
      return callback(err);
    }

    async.parallel([
      latestAmi.bind(null, AWS, opts),
      latestWorkerAmi.bind(null, AWS, opts)
    ], function(err, images) {
      if (err) {
        return callback(err);
      }

      var versionKeys = {
        router: crypto.randomBytes(6).toString('hex'),
        target: crypto.randomBytes(6).toString('hex'),
        worker: crypto.randomBytes(6).toString('hex')
      };

      async.parallel([
        function(next) {
          var config = { ami: images[0], size: opts.routerSize, type: opts.routerType, version: versionKeys.router  };
          routers.create(AWS, stack, config, next);
        },
        function(next) {
          var config = { ami: images[0], size: opts.versionSize, type: opts.versionType, version: versionKeys.target };
          targets.create(AWS, stack, config, next);
        },
        function(next) {
          var config = { ami: images[1], type: opts.workerType, version: versionKeys.worker };
          workers.create(AWS, stack, config, next);
        }
      ], function(err) {
        if (err) {
          return callback(err);
        }

        console.log('Traffic setup')
        async.parallel([
          function(next) {
            routers.list(AWS, opts.stack, function(err, versions) {
              if (err) {
                return next(err);
              }
              
              var version = versions.filter(function(version) {
                return (version.AppVersion === versionKeys.router);
              })[0];

              setTimeout(function() {
                var config = { stack: opts.stack, version: version, replace: true, elbName: stack.Resources['ZettaELB'].PhysicalResourceId };
                traffic.route(AWS, config, next);
              }, 60000);
            });
          },
          function(next) {
            traffic.setZettaVersion(AWS, opts.stack, versionKeys.target, opts.keyPair, next);
          }
        ], function(err) {
          if (err) {
            console.log('traffic error:', err);
          }
          return callback(err, versionKeys);
        });
      });
    });
  });
};

function latestAmi(AWS, opts, cb) {
  if (typeof opts.ami === 'string' && opts.ami.indexOf('ami-') === 0) {
    return cb(null, opts.ami);
  } else {
    amis.list(AWS, function(err, images) {
      if (err) {
        return cb(err);
      }
      return cb(null, images[images.length - 1].ImageId);
    });
  }
};

function latestWorkerAmi(AWS, opts, cb) {
  if (typeof opts.workerAmi === 'string' && opts.workerAmi.indexOf('ami-') === 0) {
    return cb(null, opts.workerAmi);
  } else {
    amis.listWorker(AWS, function(err, images) {
      if (err) {
        return cb(err);
      }
      return cb(null, images[images.length - 1].ImageId);
    });
  }
};

