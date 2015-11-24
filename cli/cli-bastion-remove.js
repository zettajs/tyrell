var fs = require('fs');
var program = require('commander');
var AWS = require('aws-sdk'); 
var bastion = require('./lib/bastion');

AWS.config.update({region: 'us-east-1'});

program
  .parse(process.argv);

var ec2 = new AWS.EC2();
bastion.remove(AWS, function(err) {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  console.log('Bastions Stack Removed');
});



