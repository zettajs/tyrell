var https = require('https');

var DEFAULT_BASE = 'https://discovery.etcd.io/new';

module.exports = function(base, cb) {
  if (typeof base === 'function') {
    cb = base;
    base = DEFAULT_BASE;
  }

  https.get(base, function(res) {
    if (res.statusCode !== 200) {
      return cb(new Error('Unexpected error code'));
    }
    var body = '';
    res.on('data', function (chunk) {
      body += chunk;
    });
    res.on('end', function() {
      cb(null, body);
    })
  }).on('error', cb);
  
};
