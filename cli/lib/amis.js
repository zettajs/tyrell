var list = module.exports.list = function(AWS, cb) {
  var ec2 = new AWS.EC2();
  
  ec2.describeImages({ Owners: ['self'] }, function(err, data) {
    if(err) {
      cb(err);  
    }

    cb(null, data.Images);  
  });  
}
