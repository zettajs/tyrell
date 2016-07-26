var program = require('commander');
var AWS = require('aws-sdk'); 
var traffic = require('./lib/traffic');
var tenantMgmt = require('./lib/tenant-mgmt-api');
var stacks = require('./lib/stacks');

AWS.config.update({region: 'us-east-1'});

program
  .option('--version <api version>', 'Logical version of the api being deployed', null)
  .option('--no-replace', 'Do not replace any versions.')
  .parse(process.argv);

var name = program.args[0];
if (!name) {
  program.help();
  process.exit(1);
}

stacks.get(AWS, name, function(err, stack) {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  if (!program.version) {
    var showInstancesInElb = function(logicalName, cb) {
      traffic.list(AWS, stack.Resources[logicalName].PhysicalResourceId, function(err, instances) {
        if (err) {
          console.error(err);
          process.exit(1);
        }
        console.log(logicalName);
        console.log('\tInstanceId ElbState  State   Version      AutoScaleGroup')
        instances.forEach(function(instance) {
          console.log('\t',instance.InstanceId, instance.ELBState, instance.State.Name, instance.Tags['zetta:mqttbroker:version'], instance.Tags['aws:autoscaling:groupName'])
        });
      });
    };
    showInstancesInElb('ExternalTenantMgmtAPIELB');
    showInstancesInElb('InternalTenantMgmtAPIELB');
    return;
  }

  // deploy new version
  tenantMgmt.list(AWS, name, function(err, versions) {
    if (err) {
      console.error(err);
      process.exit(1);
    }

    var version = versions.filter(function(version) {
      return (version.AppVersion === program.version);
    })[0];


    if (!version) {
      console.error('Failed to find version with id', program.version);
      process.exit(1);
    }

    var opts = { 
      version: version,
      replace: program.replace,
      elbName: [stack.Resources['InternalTenantMgmtAPIELB'].PhysicalResourceId, stack.Resources['ExternalTenantMgmtAPIELB'].PhysicalResourceId],
      stack: name
    };

    traffic.tenantMgmtApi(AWS, opts, function(err) {
      if (err) {
        console.error(err);
        process.exit(1);
      }
    });
  });
});
