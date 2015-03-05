var async = require('async');
var getStack = require('./get-stack');

var list = module.exports.list = function(AWS, cb) {
  var cloudformation = new AWS.CloudFormation();
  
  cloudformation.describeStacks({}, function(err, data) {
    if (err) {
      return cb(err);
    }
    var stacks = data.Stacks.filter(function(stack) {
      return stack.Tags.some(function(tag) {
        return tag.Key === 'zetta:stack:main';
      });
    }).map(function(s) {
      return s.StackName;
    });

    async.map(stacks, getStack.bind(null, AWS), cb);
  });

};
