// Copyright 2018 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

var fs = require('fs');
var path = require('path');
var program = require('commander');
var async = require('async');
var Packer = require('./lib/packer');
var Vagrant = require('./lib/vagrant');
var AWS = require('aws-sdk');
var coreosamis = require('coreos-amis');

var TYRELL_VERSION = require('./package.json').version;

program
  .option('-v, --verbose', 'Display packer build output')
  .option('-c, --channel [channel]', 'CoreOS update channel [stable], used only for Vagrant', 'stable')
  .option('--core-os-version [version]', 'CoreOS version to get ami value', '1010.6.0')
  .option('--ami-type [hvm|pv]', 'AWS ami virtualization type', 'hvm')
  .option('--aws-build-type [instance type]', 'AWS instance type to build with. Note: If virtualization pv is used build type is m1.large', 't2.medium')
  .option('--root-device-name [device name]', 'AWS root device name', '/dev/xvda')
  .option('-w, --worker', 'Build device data worker')
  .option('-m, --metrics', 'Build a metrics collection stack')
  .option('-b, --bastion', 'Build a bastion server')
  .option('-t, --tag <tag>', 'Pull a specific docker container that corresponds to all images with updatable tags')
  .option('--router-tag <tag>', 'Pull a specfic docker container that corresponds to tag for router')
  .option('--target-tag <tag>', 'Pull a specific docker container that corresponds to tag for target')
  .option('--tenant-mgmt-api-tag <tag>', 'Pull a specific docker container that corresponds to tag for tenant mgmt api')
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
  'tenantMgmtApiTag': 'zetta/link-tenant-mgmt-api',
  'routerTag': 'zetta/link-router',
  'targetTag': 'zetta/link-zetta-target'
};

if (program.tag) {
  Object.keys(containerNames).forEach(function(key) {
    program[key] = program.tag;
  });
}

var containerCommands = [];

Object.keys(containerNames).forEach(function(key) {
  if (program[key] === undefined) {
    return;
  }
  var imageToPull = containerNames[key] + ':' + program[key];
  var pullTag = 'docker pull ' + imageToPull;
  var tagContainer = 'docker tag -f ' + imageToPull + ' ' + containerNames[key];
  containerCommands.push(pullTag, tagContainer);
});

if(!exists) {
  fs.createReadStream(homeConfigPath).pipe(fs.createWriteStream(configPath));
}

function extendProvisionsTemplate(orig, updates) {
  var config = JSON.parse(JSON.stringify(orig));
  if (Array.isArray(updates.provisioners)) {
    config.provisioners = config.provisioners.concat(updates.provisioners); 
  }

  if (updates.variables && typeof updates.variables.output_name === 'string') {
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

coreosamis()
  .version(program.coreOsVersion)
  .region('us-east-1')
  .get(function(err, results) {
    if (err) {
      console.error('Finding ami:', err);
      return process.exit(1);
    }

    if (program.amiType === 'pv') {
      program.awsBuildType = 'm1.large';
      program.rootDeviceName = '/dev/sda';
    }

    var baseAmi = results[program.amiType]
    if (!baseAmi) {
      console.error('Could not ami matching version or ami type.');
      return process.exit(1);
    }
    
    if (program.worker) {
      console.log('Building Device data worker');

      var packerTemplateFilePath = path.join(Packer.packerPath(), 'packer_data_worker.json');
      var packerTemplateFile = require(packerTemplateFilePath);
      var credentials = new AWS.SharedIniFileCredentials({profile: 'default'});
      packerTemplateFile.variables.aws_access_key = process.env.AWS_ACCESS_KEY_ID || credentials.accessKeyId;
      packerTemplateFile.variables.aws_secret_key = process.env.AWS_SECRET_ACCESS_KEY || credentials.secretAccessKey;

      var config = extendProvisionsTemplate(packerTemplateFile, { ami_tags: {
        'versions:tyrell': TYRELL_VERSION,
        'versions:zetta-device-data-worker': 'latest'
      }});
      var workerConfigPath = writeToFile(config, 'worker_packer.json');

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
      console.log('Platform', platform, program.coreOsVersion);
      Packer.isoMd5(program.coreOsVersion, function(err, md5) {
        if(program.metrics){
          console.log('Building Metrics');
          var packerTemplateFilePath = path.join(Packer.packerPath(), 'packer_metrics_service.json');
          var packerTemplateFile = require(packerTemplateFilePath);
          packerTemplateFile.variables.checksum = md5;
          packerTemplateFile.variables.version = program.coreOsVersion;
          var metricsConfigPath = writeToFile(packerTemplateFile, 'metrics_packer.json');
          
          async.parallel([
            function(next) {
              buildMetricsStack(metricsConfigPath, 'virtualbox-iso', next);    
            }
          ], function(err) {
            if(err) {
              throw err;
            }
          });
        } else if(program.bastion){
          console.log('Building bastion');
          var packerTemplateFilePath = path.join(Packer.packerPath(), 'packer_bastion_server.json');
          var packerTemplateFile = require(packerTemplateFilePath);
          packerTemplateFile.variables.checksum = md5;
          packerTemplateFile.variables.version = program.coreOsVersion;
          var bastionConfigPath = writeToFile(packerTemplateFile, 'bastion_packer.json');
          
          async.parallel([
            function(next) {
              buildBastionServer(bastionConfigPath, 'virtualbox-iso', next);    
            }
          ], function(err) {
            if(err) {
              throw err;
            }
          });
        } else {
          
          var packerTemplateFilePath = path.join(Packer.packerPath(), 'packer_template_base.json');
          var packerTemplateFile = require(packerTemplateFilePath);          
          packerTemplateFile.variables.checksum = md5;
          packerTemplateFile.variables.version = program.coreOsVersion;
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
        }

      });    
    } else if (platform === 'aws') {
      console.log('Using ami ', baseAmi, 'building with', program.awsBuildType);
      if (program.metrics){
        var packerTemplateFilePath = path.join(Packer.packerPath(), 'packer_metrics_service.json');
        var packerTemplateFile = require(packerTemplateFilePath);
        var credentials = new AWS.SharedIniFileCredentials({profile: 'default'});
        packerTemplateFile.variables.aws_access_key = process.env.AWS_ACCESS_KEY_ID || credentials.accessKeyId;
        packerTemplateFile.variables.aws_secret_key = process.env.AWS_SECRET_ACCESS_KEY || credentials.secretAccessKey;

        var config = extendProvisionsTemplate(packerTemplateFile, { ami_tags: {
          'versions:tyrell': TYRELL_VERSION,
        }});
        var metricsConfigPath = writeToFile(config, 'metrics_packer.json');
        
        async.parallel([
          function(next) {
            buildMetricsStack(metricsConfigPath, 'amazon-ebs', next);    
          }
        ], function(err) {
          if(err) {
            throw err;
          }
        });
      } else if (program.bastion){
        var packerTemplateFilePath = path.join(Packer.packerPath(), 'packer_bastion_server.json');
        var packerTemplateFile = require(packerTemplateFilePath);
        var credentials = new AWS.SharedIniFileCredentials({profile: 'default'});
        packerTemplateFile.variables.aws_access_key = process.env.AWS_ACCESS_KEY_ID || credentials.accessKeyId;
        packerTemplateFile.variables.aws_secret_key = process.env.AWS_SECRET_ACCESS_KEY || credentials.secretAccessKey;

        var config = extendProvisionsTemplate(packerTemplateFile, { ami_tags: {
          'versions:tyrell': TYRELL_VERSION,
        }});
        var bastionConfigPath = writeToFile(config, 'bastion_packer.json');
        
        async.parallel([
          function(next) {
            buildBastionServer(bastionConfigPath, 'amazon-ebs', next);    
          }
        ], function(err) {
          if(err) {
            throw err;
          }
        });
      } else {
        var packerTemplateFilePath = path.join(Packer.packerPath(), 'packer_template_base.json');
        var packerTemplateFile = require(packerTemplateFilePath);
        var credentials = new AWS.SharedIniFileCredentials({profile: 'default'});
        packerTemplateFile.variables.aws_access_key = process.env.AWS_ACCESS_KEY_ID || credentials.accessKeyId;
        packerTemplateFile.variables.aws_secret_key = process.env.AWS_SECRET_ACCESS_KEY || credentials.secretAccessKey;
        packerTemplateFile.variables.core_os_ami = baseAmi;
        packerTemplateFile.variables.aws_build_type = program.awsBuildType;
        packerTemplateFile.variables.aws_root_device = program.rootDeviceName;
        
        var zettaProvisioningTemplate = updateProvisioningTemplate(require(path.join(Packer.packerPath(), 'zetta_provisions.json')), containerCommands);

        // AWS Router/Target Box
        // Add Tags for zetta-cloud-proxy and zetta-target-server
        // versions:zetta-cloud-proxy@latest
        // versions:zetta-target-server@latest
        zettaProvisioningTemplate.ami_tags['versions:tyrell'] = TYRELL_VERSION;
        zettaProvisioningTemplate.ami_tags['versions:zetta-cloud-proxy'] = program.tag || program.routerTag || 'latest';
        zettaProvisioningTemplate.ami_tags['versions:zetta-target-server'] = program.tag || program.targetTag || 'latest';

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
    } 

    function buildMetricsStack(configPath, buildType, done) {
      var BoxType = 'new-metrics';

      function buildBox(configPath, BoxType, done) {
        var boxFilePath = path.join(Packer.packerPath(), 'builds', BoxType + '_coreos-packer.box');
        
        var proc = Packer.command(['build', '-only='+buildType, configPath], function(code) {
          if(code !== 0) {
            return done(new Error('Non-Zero exit code. Build not completed'));
          }

          if(buildType == 'virtualbox-iso') {
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
          } else {
            done(); 
          }

          
        });

        if(verbose) {
          proc.stdout.on('data', function(chunk) {
            process.stdout.write(chunk.toString());
          });
        }  
      }
      
      buildBox(configPath, BoxType, done);
    }

    function buildBastionServer(configPath, buildType, done) {
      var BoxType = 'bastion';

      function buildBox(configPath, BoxType, done) {
        var boxFilePath = path.join(Packer.packerPath(), 'builds', BoxType + '_coreos-packer.box');
        
        var proc = Packer.command(['build', '-only='+buildType, configPath], function(code) {
          if(code !== 0) {
            return done(new Error('Non-Zero exit code. Build not completed'));
          }

          if(buildType == 'virtualbox-iso') {
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
          } else {
            done(); 
          }
        });

        if(verbose) {
          proc.stdout.on('data', function(chunk) {
            process.stdout.write(chunk.toString());
          });
        }  
      }
      
      buildBox(configPath, BoxType, done);
    }

  })
