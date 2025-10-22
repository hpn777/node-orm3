var common = require('../common');
var async  = require('async');
var should = require('should');

module.exports.connect = function(cb) {
  var opts = {};

  if (1 in arguments) {
    opts = arguments[0];
    cb   = arguments[1];
  }
  common.createConnection(opts, function (err, conn) {
    if (err) throw err;
    cb(conn);
  });
};

module.exports.connectAsync = function(opts) {
  return new Promise((resolve, reject) => {
    common.createConnection(opts || {}, function (err, conn) {
      if (err) reject(err);
      else resolve(conn);
    });
  });
};

module.exports.dropSync = function (models, done) {
  module.exports.dropSyncAsync(models)
    .then(function () {
      done();
    })
    .catch(function (err) {
      if (common.protocol() != 'sqlite') {
        done(err);
      } else {
        done();
      }
    });
};

module.exports.dropSyncAsync = async function (models) {
  if (!Array.isArray(models)) {
    models = [models];
  }

  for (const item of models) {
    try {
      await item.drop();
      await item.sync();
    } catch (err) {
      if (common.protocol() != 'sqlite') {
        throw err;
      }
    }
  }
};

