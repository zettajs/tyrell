var fs = require('fs');
var path = require('path');
var program = require('commander');
var async = require('async');
var Packer = require('./lib/packer');
var Vagrant = require('./lib/vagrant');
var AWS = require('aws-sdk');

program
  .option('-v --verbose', 'Display packer build output')
  .option('-c, --channel [channel]', 'CoreOS update channel [alpha]', 'alpha')
  .option('-w, --worker', 'Build device data worker')
  .option('-t, --tag <tag>', 'Pull a specific docker container that corresponds to tag for router and proxy.')
  .option('--router-tag <tag>', 'Pull a specfic docker container that corresponds to tag for router')
  .option('--target-tag <tag>', 'Pull a specific docker container that corresponds to tag for target')
  .parse(process.argv);

var platform = program.args[0];

if(!platform) {
  program.help();
  process.exit(1);  
}

var verbose = program.verbose;

var configPath = path.join(Packer.packerPath(), '.dockercfg');
var homeConfigPath = path.join(process.env.HOME, '.dockercfg');
var exists = fs.existsSync(configPath);

var containerNames = {
  ROUTER: 'zetta/zetta-cloud-proxy',
  TARGET: 'zetta/zetta-target-server'
};

var customRouter = false;
var customTarget = false;

if(program.routerTag) {
  var tagString = ':' + program.routerTag;
  containerNames.ROUTER += tagString;
  customRouter = true;
}

if(program.targetTag) {
  var tagString = ':' + program.targetTag;
  containerNames.TARGET += tagString;
  customTarget = true;
}

if(program.tag) {
  var tagString = ':' + program.tag;
  containerNames.TARGET += tagString;
  containerNames.ROUTER += tagString;
  customRouter = true;
  customTarget = true;
}

var containerCommands = [];

if(customRouter) {
  var pullTag = 'docker pull ' + containerNames.ROUTER;
  var tagContainer = 'docker tag ' + containerNames.ROUTER + ' zetta/zetta-cloud-proxy';  
  containerCommands.push(pullTag, tagContainer);
} else {
  var pullTag = 'docker pull ' + containerNames.ROUTER;
  containerCommands.push(pullTag); 
}

if(customTarget) {
  var pullTag = 'docker pull ' + containerNames.TARGET;
  var tagContainer = 'docker tag ' + containerNames.TARGET + ' zetta/zetta-target-server';
  containerCommands.push(pullTag, tagContainer);  
} else {
  var pullTag = 'docker pull ' + containerNames.TARGET;
  containerCommands.push(pullTag);
}

if(!exists) {
  fs.createReadStream(homeConfigPath).pipe(fs.createWriteStream(configPath));
}

function extendProvisionsTemplate(orig, updates) {
  var config = JSON.parse(JSON.stringify(orig));
  if (Array.isArray(updates.provisioners)) {
    config.provisioners = config.provisioners.concat(updates.provisioners); 
  }

  if (typeof updates.variables.output_name === 'string') {
    config.variables.output_name = updates.variables.output_name;
  }

  if (typeof updates.ami_tags === 'object') {
    var amiBuild = config.builders.filter(function(build) {
      return (build.type === 'amazon-ebs');
    })[0];
    
    if (amiBuild) {
      for (var k in updates.ami_tags) {
        amiBuild.tags[k] = updates.ami_tags[k];
      }
    }
  }

  return config;
}

function updateProvisioningTemplate(orig, update){
  var config = JSON.parse(JSON.stringify(orig)); 
  var inlineProvisioners = config.provisioners.filter(function(provisioner) {
    return provisioner.type === 'shell' && Array.isArray(provisioner.inline);  
  });  

  var provisioner = inlineProvisioners[0];

  provisioner.inline = update;
  return config;
}

function writeToFile(config, filePath) {

  // create build path
  try {
    fs.mkdirSync(path.join(Packer.packerPath(), 'builds'));
  } catch(err) {
  }

  var packerFilePath = path.join(Packer.packerPath(), 'builds', filePath);
  var fd = fs.openSync(packerFilePath, 'w+');
  fs.writeSync(fd, JSON.stringify(config, null, '\t'));
  fs.closeSync(fd);
  return packerFilePath;
}

if (program.worker) {
  console.log('Building Device data worker');

  var packerTemplateFilePath = path.join(Packer.packerPath(), 'packer_data_worker.json');
  var packerTemplateFile = require(packerTemplateFilePath);
  var credentials = new AWS.SharedIniFileCredentials({profile: 'default'});
  packerTemplateFile.variables.aws_access_key = process.env.AWS_ACCESS_KEY_ID || credentials.accessKeyId;
  packerTemplateFile.variables.aws_secret_key = process.env.AWS_SECRET_ACCESS_KEY || credentials.secretAccessKey;

  var workerConfigPath = writeToFile(packerTemplateFile, 'worker_packer.json');

  async.parallel([
    function(next) { buildBox(workerConfigPath, 'worker', next) },
  ], function(err) {
    if (err) {
      throw err;
    }
  });

  function buildBox(configPath, boxType, done) {
    var proc = Packer.command(['build', '-only=amazon-ebs', configPath], function(code) {
      if(code !== 0) {
        return done(new Error('Non-Zero exit code. Build not completed'));
      }
      done();
    });

    if(verbose) {
      proc.stdout.on('data', function(chunk) {
        process.stdout.write(chunk.toString());
      });
      proc.stderr.on('data', function(chunk) {
        process.stderr.write(chunk.toString());
      });
    }
  }
  
  return;
}

if(platform === 'vagrant') {
  Packer.isoMd5(function(err, md5) {
    var packerTemplateFilePath = path.join(Packer.packerPath(), 'packer_template_base.json');
    var packerTemplateFile = require(packerTemplateFilePath);
    packerTemplateFile.variables.checksum = md5;
  var zettaProvisioningTemplate = updateProvisioningTemplate(require(path.join(Packer.packerPath(), 'zetta_provisions.json')), containerCommands);  
    var zettaConfig = extendProvisionsTemplate(packerTemplateFile, zettaProvisioningTemplate);
    var zettaConfigPath = writeToFile(zettaConfig, 'zetta_packer.json');

    async.parallel([
      function(next) { buildBox(zettaConfigPath, 'zetta', next) },
    ], function(err) {
      if (err) {
        throw err;
      }
    });

    function buildBox(configPath, BoxType, done) {
      var boxFilePath = path.join(Packer.packerPath(), 'builds', BoxType + '_coreos-packer.box');
      
      var proc = Packer.command(['build', '-only=virtualbox-iso', configPath], function(code) {
        if(code !== 0) {
          return done(new Error('Non-Zero exit code. Build not completed'));
        }

        var vagrant = Vagrant.command(['box', 'add', BoxType + '-coreos-' + program.channel + '-build', boxFilePath, '--force'], function(code) {
          if(code !== 0) {
            return done(new Error('Non-Zero exit code. Vagrant box not configured.'));
          }
          done();
        }); 

        if(verbose) {
          vagrant.stdout.on('data', function(chunk) {
            process.stdout.write(chunk.toString());
          });
        }
      });

      if(verbose) {
        proc.stdout.on('data', function(chunk) {
          process.stdout.write(chunk.toString());
        });
      }

    }

  });    
} else if (platform === 'aws') {
  var packerTemplateFilePath = path.join(Packer.packerPath(), 'packer_template_base.json');
  var packerTemplateFile = require(packerTemplateFilePath);
  var credentials = new AWS.SharedIniFileCredentials({profile: 'default'});
  packerTemplateFile.variables.aws_access_key = process.env.AWS_ACCESS_KEY_ID || credentials.accessKeyId;
  packerTemplateFile.variables.aws_secret_key = process.env.AWS_SECRET_ACCESS_KEY || credentials.secretAccessKey;
  var zettaProvisioningTemplate = updateProvisioningTemplate(require(path.join(Packer.packerPath(), 'zetta_provisions.json')), containerCommands);
  var zettaConfig = extendProvisionsTemplate(packerTemplateFile, zettaProvisioningTemplate);
  var zettaConfigPath = writeToFile(zettaConfig, 'zetta_packer.json');

  async.parallel([
    function(next) { buildBox(zettaConfigPath, 'zetta', next) },
  ], function(err) {
    if (err) {
      throw err;
    }
  });

  function buildBox(configPath, boxType, done) {
    var proc = Packer.command(['build', '-only=amazon-ebs', configPath], function(code) {
      if(code !== 0) {
        return done(new Error('Non-Zero exit code. Build not completed'));
      }
      done();
    });

    if(verbose) {
      proc.stdout.on('data', function(chunk) {
        process.stdout.write(chunk.toString());
      });
    }
  }
} 
