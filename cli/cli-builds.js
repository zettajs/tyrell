var program = require('commander');
var AWS = require('aws-sdk');
var amis = require('./lib/amis');

AWS.config.update({ region: 'us-east-1' });

program
  .command('create', 'create a new CoreOS image for zetta.')
  .option('--worker', 'Show sqs worker builds')
  .parse(process.argv);

if(program.args.length) {
  return;
}

if (program.worker) {
  amis.listWorker(AWS, function(err, images) {
    if(err) {
      console.error(err);
      process.exit(1);  
    } 
    
    display(images);
  });
} else {
  amis.list(AWS, function(err, images) {
    if(err) {
      console.error(err);
      process.exit(1);  
    } 
    
    display(images);
  });
}


function display(images) {
  images = images.sort(function(a, b) {
    var d1 = a.CreationDate;
    var d2 = b.CreationDate;
    if (d1 > d2) {
      return 1;
    } else if (d2 > d1) {
      return -1;
    } else {
      return 0;
    }
  });

  console.log(['Image ID',
               'Build Date',
               'Virtualization Type',
               'zetta-cloud-proxy',
               'zetta-target-server',
               'tyrell',
              ].join('\t'));
  
  images.forEach(function(image) {
    console.log([image.ImageId,
                 image.CreationDate,
                 (image.VirtualizationType === 'hvm') ? 'hvm' : 'para',
                 image.Tags['versions:zetta-cloud-proxy'],
                 image.Tags['versions:zetta-target-server'],
                 image.Tags['versions:tyrell']
                ].join('\t'));
  });
}
