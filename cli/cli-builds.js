var program = require('commander');
var AWS = require('aws-sdk');
var amis = require('./lib/amis');

AWS.config.update({ region: 'us-east-1' });

program
  .command('create', 'create a new CoreOS image for zetta.')
  .parse(process.argv);

if(program.args.length) {
  return;
}

amis.list(AWS, function(err, images) {
  if(err) {
    console.error(err);
    process.exit(1);  
  } 

  images.forEach(function(image) {
    console.log(image.ImageId, '\t', image.CreationDate, '\t', image.Name);  
  });
});
