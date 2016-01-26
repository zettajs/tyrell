var list = module.exports.list = function(AWS, cb) {
  var filter = [{ Name: 'tag-key', Values: ['zetta:app'] }];  
  return listAll(AWS, filter, cb);
}

var get = module.exports.get = function(AWS, ami, cb) {
  var filter = [{ Name: 'image-id', Values: [ami] }];  
  return listAll(AWS, filter, function(err, images) {
    return cb(err, images[0]);
  });
}

var listWorker = module.exports.listWorker = function(AWS, cb) {
  var filter = [{ Name: 'tag-key', Values: ['zetta:datasqs'] }];
  return listAll(AWS, filter, cb);
}

var listAll = module.exports.listAll = function(AWS, filter, cb) {
  var ec2 = new AWS.EC2();
  ec2.describeImages({ Owners: ['self'], Filters: filter }, function(err, data) {
    if(err) {
      return cb(err);  
    }

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

    data.Images = data.Images.map(function(image) {
      var tags = {};
      image.Tags.forEach(function(tag) {
        tags[tag.Key] = tag.Value;
      });
      image.Tags = tags;
      return image;
    });

    cb(null, data.Images);
  });  
}

