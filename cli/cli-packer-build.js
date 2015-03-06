var fs = require('fs');
var path = require('path');
var program = require('commander');
var BoxFileName = 'packer_virtualbox-iso_virtualbox.box';
var BoxName = 'zetta-coreos-alpha';
var Packer = require('./lib/packer');
var Vagrant = require('./lib/vagrant');


program
  .option('-p --platform <platform>', 'Platform to create image for. Required.')
  .option('-v --verbose', 'Display packer build output')
  .parse(process.argv);

var platform = program.platform;
var verbose = program.verbose;

var configPath = path.join(Packer.packerPath(), '.dockercfg');
var homeConfigPath = path.join(process.env.HOME, '.dockercfg');
var exists = fs.existsSync(configPath);

if(!exists) {
  fs.createReadStream(homeConfigPath).pipe(fs.createWriteStream(configPath));
}

if(platform === 'vagrant') {
  Packer.isoMd5(function(err, md5) {
    var packerTemplateFilePath = path.join(Packer.packerPath(), 'packer_template.json');
    var boxFilePath = path.join(Packer.packerPath(), BoxFileName);
    var packerTemplateFile = require(packerTemplateFilePath);
    packerTemplateFile.variables.checksum = md5;
    var packerFilePath = path.join(Packer.packerPath(), 'packer.json');
    var fd = fs.openSync(packerFilePath, 'w+');
    fs.writeSync(fd, JSON.stringify(packerTemplateFile, null, '\t'));
    fs.closeSync(fd);
    var proc = Packer.command(['build', '-only=virtualbox-iso', 'packer.json'], function(code) {
      if(code !== 0) {
        throw new Error('Non-Zero exit code. Build not completed');  
      }

      var vagrant = Vagrant.command(['box', 'add', BoxName, boxFilePath, '--force'], function(code) {
        if(code !== 0) {
          throw new Error('Non-Zero exit code. Vagrant box not configured.');  
        }  
      }); 

      if(verbose) {
        vagrant.stdout.on('data', function(chunk) {
          console.log(chunk.toString());  
        });  
      }
    });

    if(verbose) {
      proc.stdout.on('data', function(chunk) {
        console.log(chunk.toString());  
      });  
    }
  });    
} else if (platform === 'aws') {
  if(!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error('AWS Credentials not set. Build Halted');  
  }

  var packerTemplateFilePath = path.join(Packer.packerPath(), 'packer_template.json');
  var packerTemplateFile = require(packerTemplateFilePath);
  packerTemplateFile.variables.aws_access_key = process.env.AWS_ACCESS_KEY_ID;
  packerTemplateFile.variables.aws_secret_key = process.env.AWS_SECRET_ACCESS_KEY;
  var packerFilePath = path.join(Packer.packerPath(), 'packer.json');
  var fd = fs.openSync(packerFilePath, 'w+');
  fs.writeSync(fd, JSON.stringify(packerTemplateFile, null, '\t'));
  fs.closeSync(fd);
  var proc = Packer.command(['build', '-only=amazon-ebs', 'packer.json'], function(code) {
    if(code !== 0) {
      throw new Error('Non-Zero exit code. Build not completed');  
    }
  });

  if(verbose) {
    proc.stdout.on('data', function(chunk) {
      console.log(chunk.toString());  
    });  
  }
}
