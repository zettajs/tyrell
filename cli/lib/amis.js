var list = module.exports.list = function(AWS, cb) {
  var ec2 = new AWS.EC2();
  
  ec2.describeImages({ Owners: ['self'] }, function(err, data) {
    if(err) {
      cb(err);  
    }

    data.Images = data.Images.filter(function(image) {
      return image.Tags.filter(function(tag) {
        return tag.Key === 'zetta:app';
      }).length > 0;
    });

    cb(null, data.Images);  
  });  
}
