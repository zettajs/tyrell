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
    data.Images = data.Images.sort(function(a, b) {
      var d1 = a.CreationDate;
      var d2 = b.CreationDate;
      if (d1 > d2) {
        return 1;
      } else if (d2 > d1) {
        return -1;
      } else {
        return 0;
      }
    });

    cb(null, data.Images);
  });  
}

