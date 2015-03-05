var fs = require('fs');

module.exports = function(AWS, config, done) {
  var cloudformation = new AWS.CloudFormation();

  var stackName = config.stack;
  var params = {
    StackName: stackName,
    OnFailure: 'DELETE',
    Parameters: [
      { ParameterKey: 'DiscoveryUrl', ParameterValue: config.discoveryUrl },
      { ParameterKey: 'KeyPair', ParameterValue: config.keyPair }
    ],
    Tags: [
      { Key: 'zetta:stack', Value: stackName },
      { Key: 'zetta:stack:main', Value: 'true' }
    ],
    TemplateBody: fs.readFileSync('../aws/initial-stack-cf.json').toString(),
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

}
