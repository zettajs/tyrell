var crypto = require('crypto');
var program = require('commander');
var AWS = require('aws-sdk'); 
var createZettaCf = require('./lib/create-zetta-cf');
var awsUtils = require('./lib/aws-utils');
var getStack = require('./lib/get-stack');
var getAppVersions = require('./lib/get-app-versions');

AWS.config.update({region: 'us-east-1'});

program
  .parse(process.argv);


var name = program.args[0];
if (!name) {
  program.help();
  process.exit(1);
}

getAppVersions(AWS, name, function(err, versions) {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  versions.forEach(function(v) {
    console.log(v.AppVersion, v.StackName)
  });
});
