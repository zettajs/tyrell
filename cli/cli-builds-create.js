var fs = require('fs');
var path = require('path');
var program = require('commander');
var async = require('async');
var Packer = require('./lib/packer');
var Vagrant = require('./lib/vagrant');

program
  .option('-v --verbose', 'Display packer build output')
  .option('-c, --channel [channel]', 'CoreOS update channel [alpha]', 'alpha')
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

function writeToFile(config, filePath) {
  var packerFilePath = path.join(Packer.packerPath(), 'builds', filePath);
  var fd = fs.openSync(packerFilePath, 'w+');
  fs.writeSync(fd, JSON.stringify(config, null, '\t'));
  fs.closeSync(fd);
  return packerFilePath;
}

if(platform === 'vagrant') {
  Packer.isoMd5(function(err, md5) {
    var packerTemplateFilePath = path.join(Packer.packerPath(), 'packer_template_base.json');
    var packerTemplateFile = require(packerTemplateFilePath);
    packerTemplateFile.variables.checksum = md5;
    
    var zettaConfig = extendProvisionsTemplate(packerTemplateFile, require(path.join(Packer.packerPath(), 'zetta_provisions.json')));
    var zettaConfigPath = writeToFile(zettaConfig, 'zetta_packer.json');

    var influxdbConfig = extendProvisionsTemplate(packerTemplateFile, require(path.join(Packer.packerPath(), 'influxdb_provisions.json')));
    var influxdbConfigPath = writeToFile(influxdbConfig, 'influxdb_packer.json');

    async.parallel([
      function(next) { buildBox(zettaConfigPath, 'zetta', next) },
      function(next) {
        setTimeout(function() {
          buildBox(influxdbConfigPath, 'influxdb', next);
        }, 30000);
      }
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
  if(!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error('AWS Credentials not set. Build Halted');  
  }

  var packerTemplateFilePath = path.join(Packer.packerPath(), 'packer_template_base.json');
  var packerTemplateFile = require(packerTemplateFilePath);
  packerTemplateFile.variables.aws_access_key = process.env.AWS_ACCESS_KEY_ID;
  packerTemplateFile.variables.aws_secret_key = process.env.AWS_SECRET_ACCESS_KEY;

  var zettaConfig = extendProvisionsTemplate(packerTemplateFile, require(path.join(Packer.packerPath(), 'zetta_provisions.json')));
  var zettaConfigPath = writeToFile(zettaConfig, 'zetta_packer.json');

  var influxdbConfig = extendProvisionsTemplate(packerTemplateFile, require(path.join(Packer.packerPath(), 'influxdb_provisions.json')));
  var influxdbConfigPath = writeToFile(influxdbConfig, 'influxdb_packer.json');


  async.parallel([
    function(next) { buildBox(zettaConfigPath, 'zetta', next) },
    function(next) { buildBox(influxdbConfigPath, 'influxdb', next) }
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
