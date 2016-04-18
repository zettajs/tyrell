var program = require('commander');
var AWS = require('aws-sdk'); 
var traffic = require('./lib/traffic');
var credentialApi = require('./lib/credential-api');
var stacks = require('./lib/stacks');

AWS.config.update({region: 'us-east-1'});

program
  .option('--version <router version>', 'Logical version of the credential being deployed', null)
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
    // list current version
    traffic.list(AWS, stack.Resources['CredentialAPIELB'].PhysicalResourceId, function(err, instances) {
      if (err) {
        console.error(err);
        process.exit(1);
      }
      console.log('InstanceId ElbState  State   Version      AutoScaleGroup')
      instances.forEach(function(instance) {
        console.log(instance.InstanceId, instance.ELBState, instance.State.Name, instance.Tags['zetta:credential-api:version'], instance.Tags['aws:autoscaling:groupName'])
      });
    });
    return;
  }


  // deploy new version
  credentialApi.list(AWS, name, function(err, versions) {
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
      elbName: stack.Resources['CredentialAPIELB'].PhysicalResourceId,
      stack: name
    };

    traffic.routeCredentialApi(AWS, opts, function(err) {
      if (err) {
        console.error(err);
        process.exit(1);
      }
    });
  });
});
