var https = require('https');
var url = require('url');

var DEFAULT_BASE = 'https://discovery.etcd.io/new';
var DEFAULT_SIZE = 3;

module.exports = function(size, cb) {
  if (typeof size === 'function') {
    cb = size;
    size = DEFAULT_SIZE;
  }

  var urlObj = url.parse(DEFAULT_BASE);
  urlObj.query = { size: size };

  https.get(url.format(urlObj), function(res) {
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
