var async = require('async');
module.exports = function(AWS, stackName, cb) {
  var cloudformation = new AWS.CloudFormation();

  cloudformation.describeStacks(function(err, stacks) {
    if (err) {
      return cb(err);
    }

    var stacks = stacks.Stacks.filter(function(stack) {
      return stack.Tags.filter(function(tag) { return tag.Key === 'zetta:app:version' }).length > 0;
    });
    
    async.map(stacks, function(stack, next) {
      cloudformation.describeStackResources({ StackName: stack.StackName }, function(err, data) {
        if (err) {
          return next(err);
        }

        var resources = {};
        data.StackResources.forEach(function(r) {
          resources[r.LogicalResourceId] = r;
        });
        
        stack.AppVersion = stack.Tags.filter(function(t) { return t.Key === 'zetta:app:version'})[0].Value;
        stack.Resources = resources;
        next(null, stack);
      });
    }, cb);
  });
};
