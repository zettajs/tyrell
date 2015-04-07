var list = module.exports.list = function(AWS, cb) {

  var filter = function(image) {
    return image.Tags.filter(function(tag) {
      return tag.Key === 'zetta:app';
    }).length > 0;
  };
  
  return listAll(AWS, filter, cb);
}

var listWorker = module.exports.listWorker = function(AWS, cb) {

  var filter = function(image) {
    return image.Tags.filter(function(tag) {
      return tag.Key === 'zetta:datasqs';
    }).length > 0;
  };
  
  return listAll(AWS, filter, cb);
}

var listAll = module.exports.listAll = function(AWS, filter, cb) {
  var ec2 = new AWS.EC2(); 
  ec2.describeImages({ Owners: ['self'] }, function(err, data) {
    if(err) {
      return cb(err);  
    }

    data.Images = data.Images.filter(filter);
    cb(null, data.Images);  
  });  
}

