var http = require('http');
var url = require('url');
var querystring = require('querystring');

module.exports.removeUser = function(opts, username, callback) {
  var q = 'DROP USER ' + username;
  query(opts, q, callback);
};

module.exports.createUser = function(opts, username, password, callback) {
  var q = 'CREATE USER ' + username + ' WITH PASSWORD \'' + password + '\'; GRANT WRITE ON telegraf TO ' + username;
  query(opts, q, callback);
};

function query(opts, query, callback) {
  var postData = querystring.stringify({
    'q' : query
  });

  var parsed = url.parse(opts.host);
  var httpOpts = {
    hostname: parsed.hostname,
    port: parsed.port,
    protocol: parsed.protocol,
    auth: opts.auth,
    path: '/query',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  var req = http.request(httpOpts, function(res) {
    if (res.statusCode !== 200) {
      return callback(new Error('Non 200 status code'));
    }
    
    return callback();
  });
  req.once('error', callback);
  req.end(postData);
}
