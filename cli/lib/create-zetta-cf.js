var fs = require('fs');

module.exports = function(AWS, config, done) {
  var cloudformation = new AWS.CloudFormation();

  var stackName = config.stack + '-app-' + config.app.version;
  var params = {
    StackName: stackName,
    OnFailure: 'DELETE',
    Parameters: [
      { ParameterKey: 'ZettaStack', ParameterValue: config.stack },
      { ParameterKey: 'InstanceType', ParameterValue: config.app.instance_type },
      { ParameterKey: 'ClusterSize', ParameterValue: config.app.cluster_size },
      { ParameterKey: 'AMI', ParameterValue: config.app.ami },
      { ParameterKey: 'ZettaAppSecurityGroup', ParameterValue: config.app.security_groups },
      { ParameterKey: 'LoadBalancer', ParameterValue: config.app.load_balancer },
      { ParameterKey: 'KeyPair', ParameterValue: config.keyPair }
    ],
    Tags: [
      { Key: 'zetta:stack', Value: config.stack },
      { Key: 'zetta:app:version', Value: config.app.version }
    ],
    TemplateBody: fs.readFileSync('../aws/zetta-asg-cf.json').toString(),
    TimeoutInMinutes: 5
  };


  function checkStackStatus(cb) {
    cloudformation.describeStacks({ StackName: stackName }, function(err, data) {
      if (err) {
        return cb(new Error(err.code + ' ' + err.message));
      }

      if (!data.Stacks[0]) {
        return cb(new Error('Stack does not exist'));
      }

      return cb(null, data.Stacks[0].StackStatus === 'CREATE_COMPLETE', data.Stacks[0]);
    });
  }

  cloudformation.createStack(params, function(err, data) {
    if (err) {
      return done(new Error(err.code + ' ' + err.message));
    }

    function check() {
      checkStackStatus(function(err, status, stack) {
        if (err) {
          return done(err);
        }
        if (!status) {
          return setTimeout(check, 1000);
        }
        done(null, stack);
      });
    }
    check();
  });
};
