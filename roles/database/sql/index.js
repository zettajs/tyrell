var fs = require('fs');
var pg = require('pg');

exports.handler = function(event, context) {

  var sqlData = fs.readFileSync('./create_credential_table.sql').toString();

  var connectionString = event.connectionString;

  pg.connect(connectionString, function(error, client, done) {
    if (error) {
      context.fail(error);
      return;
    }
    
    client.query(sqlData, function(error) {
      if (error) {
        context.fail(error);
        return;
      }

      done();
      context.succeed(JSON.stringify({}));
    });
  });
};
