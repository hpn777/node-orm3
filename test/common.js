var async       = require('async');
var _           = require('lodash');
var path        = require('path');
var url         = require("url");
var util        = require('util');
var querystring = require('querystring');
var Semver      = require('semver/classes/semver');
var ORM         = require('../');

var common      = exports;

common.ORM = ORM;

common.protocol = function () {
  return process.env.ORM_PROTOCOL;
};

common.isCI = function() {
  return !!process.env.CI;
};

common.createConnection = function(opts, cb) {
  ORM.connect(this.getConnectionString(opts))
    .then(conn => cb(null, conn))
    .catch(err => cb(err));
};

common.hasConfig = function (proto) {
  var config;

  if (common.isCI()) return 'found';

  try {
    config = require("./config");
  } catch (ex) {
    return 'not-found';
  }

  return (Object.prototype.hasOwnProperty.call(config, proto) ? 'found' : 'not-defined');
};

common.parseConnectionString = function (connString) {
  const config = url.parse(connString);

  if (config.auth) {
    if (config.auth.indexOf(":") >= 0) {
      config.user = config.auth.substr(0, config.auth.indexOf(":"));
      config.password = config.auth.substr(config.auth.indexOf(":") + 1);
    } else {
      config.user = config.auth;
      config.password = "";
    }
  }
  if (config.hostname) {
    config.host = config.hostname;
  }
  if (config.pathname) {
    config.database = config.pathname.slice(1);
  }

  return config;
};

common.getConnectionString = function (opts) {
  let protocol = this.protocol();
  const dbEnvVar = `${protocol.toUpperCase()}_DB_URL`;
  const dbEnvConnString = process.env[dbEnvVar];

  let config;
  let query;

  if (dbEnvConnString) {
    config = common.parseConnectionString(dbEnvConnString);
  } else {
    const testDBConfig = require("./config")[this.protocol()];

    if (typeof config == "string") {
      config = common.parseConnectionString(testDBConfig);
    } else {
      config = _.cloneDeep(testDBConfig);
    }
  }

  const defaultUsers = {
    postgres: 'postgres',
    redshift: 'postgres',
    questdb: 'admin',
    mongodb : ''
  };
  const defaultDatabases = {
    mongodb: 'test',
    questdb: 'qdb'
  };
  const defaultPorts = {
    questdb: 8812
  };

  _.defaults(config, {
    user     : Object.prototype.hasOwnProperty.call(defaultUsers, protocol) ? defaultUsers[protocol] : 'root',
    database : Object.prototype.hasOwnProperty.call(defaultDatabases, protocol) ? defaultDatabases[protocol] : 'orm_test',
    password : '',
    host     : 'localhost',
    pathname : '',
    query    : {}
  });
  _.merge(config, opts || {});

  if (config.port && typeof config.port === 'string') {
    const parsedPort = parseInt(config.port, 10);
    if (!Number.isNaN(parsedPort)) {
      config.port = parsedPort;
    }
  }

  if (!config.port && Object.prototype.hasOwnProperty.call(defaultPorts, protocol)) {
    config.port = defaultPorts[protocol];
  }

  query = querystring.stringify(config.query);

  switch (protocol) {
    case 'mysql':
    case 'postgres':
    case 'redshift':
    case 'questdb':
    case 'mongodb':
      if (common.isCI()) {
        if (protocol == 'redshift') protocol = 'postgres';
        let auth = '';
        const hasUser = typeof config.user === 'string' && config.user.length > 0;
        const hasPassword = typeof config.password === 'string' && config.password.length > 0;

        if (hasUser && hasPassword) {
          auth = `${config.user}:${config.password}`;
        } else if (hasUser) {
          auth = config.user;
        } else if (hasPassword) {
          auth = `:${config.password}`;
        }

  const hostWithPort = typeof config.port === 'number' ? `${config.host}:${config.port}` : config.host;
        const authority = auth.length > 0 ? `${auth}@${hostWithPort}` : hostWithPort;

        return util.format("%s://%s/%s?%s",
          protocol, authority, config.database, query
        );
      } else {
        const hostWithPort = typeof config.port === 'number' ? `${config.host}:${config.port}` : config.host;
        return util.format("%s://%s:%s@%s/%s?%s",
          protocol, config.user, config.password,
          hostWithPort, config.database, query
        ).replace(':@','@');
      }
    case 'sqlite':
      return util.format("%s://%s?%s", protocol, config.pathname, query);
    default:
      throw new Error("Unknown protocol " + protocol);
  }
};

common.getConnectionConfig = function (opts) {
  return common.parseConnectionString(common.getConnectionString(opts));
}

common.retry = function (before, run, until, done, args) {
  if (typeof until === "number") {
    var countDown = until;
    until = function (err) {
      if (err && --countDown > 0) return false;
      return true;
    };
  }

  if (typeof args === "undefined") args = [];

  var handler = function (err) {
    if (until(err)) return done.apply(this, arguments);
    return runNext();
  };

  args.push(handler);

  var runCurrent = function () {
    if (run.length == args.length) {
      return run.apply(this, args);
    } else {
      run.apply(this, args);
      handler();
    }
  };

  var runNext = function () {
    try {
      if (before.length > 0) {
        before(function (err) {
          if (until(err)) return done(err);
          return runCurrent();
        });
      } else {
        before();
        runCurrent();
      }
    }
    catch (e) {
      handler(e);
    }
  };

  if (before.length > 0) {
    before(function (err) {
      if (err) return done(err);
      runNext();
    });
  } else {
    before();
    runNext();
  }
};

common.nodeVersion = function () {
  return new Semver(process.versions.node);
}
