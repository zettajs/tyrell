var fs = require('fs');
var program = require('commander');
var AWS = require('aws-sdk'); 
var stacks = require('./lib/stacks');

AWS.config.update({region: 'us-east-1'});

program
  .option('-k, --keyPair <key_pair>', 'If specified will also delete keypair')
  .parse(process.argv);


var name = program.args[0];
if (!name) {
  program.help();
  process.exit(1);
}

var params = {
  influxdbHost: 'http://metrics.iot.apigee.net:8086',
  influxdbUsername: 'stack9e607d998687',
  influxdbPassword: '9021be821a92b204b9f569d685b0d1dff6f0b25ca46747a5',
};

stacks.update(AWS, name, params, function(err) {
  if (err) {
    console.error(err);
    process.exit(1);
  }
});


