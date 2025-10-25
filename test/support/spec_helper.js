var common = require('../common');
var async  = require('async');
var should = require('should');

module.exports.connect = function(opts, cb) {
  let options = {};
  let callback = cb;

  if (typeof opts === 'function') {
    callback = opts;
    options = {};
  } else if (arguments.length > 1 && typeof cb === 'function') {
    options = opts || {};
  } else if (arguments.length === 0 || typeof opts === 'object') {
    options = opts || {};
  }

  if (typeof callback === 'function') {
    common.createConnection(options, function (err, conn) {
      if (err) throw err;
      callback(conn);
    });
    return;
  }

  return new Promise((resolve, reject) => {
    common.createConnection(options, function (err, conn) {
      if (err) {
        reject(err);
      } else {
        resolve(conn);
      }
    });
  });
};

module.exports.dropSync = function (models, done) {
  const promise = dropModels(models);

  if (typeof done === 'function') {
    promise
      .then(() => done())
      .catch((err) => {
        if (common.protocol() != 'sqlite') {
          done(err);
        } else {
          done();
        }
      });
    return;
  }

  return promise.catch((err) => {
    if (common.protocol() != 'sqlite') {
      throw err;
    }
  });
};

async function dropModels(models) {
  const list = Array.isArray(models) ? models : [models];

  for (const item of list) {
    try {
      await item.drop();
      await item.sync();
    } catch (err) {
      if (common.protocol() != 'sqlite') {
        throw err;
      }
    }
  }
}

