var _        = require('lodash');
var sqlite   = require('sqlite3');
var pg       = require('pg');
var should   = require('should');
var helper   = require('../support/spec_helper');
var ORM      = require('../../');
var common   = require('../common');
var protocol = common.protocol();

describe("ORM", function() {
  describe("when loaded", function () {
    it("should expose .express(), .use() and .connect()", function (done) {
      ORM.express.should.be.a.Function();
      ORM.use.should.be.a.Function();
      ORM.connect.should.be.a.Function();

      return done();
    });

    it("should expose default settings container", function (done) {
      ORM.settings.should.be.a.Object();
      ORM.settings.get.should.be.a.Function();
      ORM.settings.set.should.be.a.Function();
      ORM.settings.unset.should.be.a.Function();

      return done();
    });

    it("should expose generic Settings constructor", function (done) {
      ORM.Settings.should.be.a.Object();
      ORM.Settings.Container.should.be.a.Function();

      return done();
    });

    it("should expose singleton manager", function (done) {
      ORM.singleton.should.be.a.Object();
      ORM.singleton.clear.should.be.a.Function();

      return done();
    });

    it("should expose predefined validators", function (done) {
      ORM.validators.should.be.a.Object();
      ORM.validators.rangeNumber.should.be.a.Function();
      ORM.validators.rangeLength.should.be.a.Function();

      return done();
    });
  });
  describe('ORM.connect()', function () {
    it('should be a function', function () {
      ORM.connect.should.be.a.Function();
    });

    it('should throw error with correct message when protocol not supported', function () {
      return ORM.connect("bd://127.0.0.6")
        .catch(function (err) {
          should.exist(err);
          err.message.should.not.equal("CONNECTION_PROTOCOL_NOT_SUPPORTED");
        });
    });

    it('should throw error with correct message when connection URL doesn\'t exist', function () {
      ORM.connect()
        .catch(function (err) {
          err.message.should.equal("CONNECTION_URL_EMPTY");
        });
    });

    it("should throw error when passed empty string like connection URL", function () {
      return ORM.connect("")
        .catch(function (err) {
          err.message.should.equal("CONNECTION_URL_EMPTY");
        });
    });

    it("should throw error when passed string with spaces only", function () {
      return ORM.connect("    ")
        .catch(function (err) {
          err.message.should.equal("CONNECTION_URL_EMPTY");
        });
    });

    it("should throw error when passed invalid protocol", function () {
      return ORM.connect("user@db")
        .catch(function (err) {
          err.message.should.equal("CONNECTION_URL_NO_PROTOCOL");
        });
    });

    it("should throw error when passed unknown protocol", function () {
      return ORM.connect("unknown://db")
        .catch(function (err) {
          should.equal(err.literalCode, 'NO_SUPPORT');
          should.equal(
            err.message,
            "Connection protocol not supported - have you installed the database driver for unknown?"
          );
        });
    });

    it("should throw error when passed invalid connection db link", function () {
      return ORM.connect("mysql://fakeuser:nopassword@127.0.0.1/unknowndb")
        .catch(function (err) {
          should.exist(err);
          should.equal(err.message.indexOf("Connection protocol not supported"), -1);
          err.message.should.not.equal("CONNECTION_URL_NO_PROTOCOL");
          err.message.should.not.equal("CONNECTION_URL_EMPTY");
        });
    });

    it("should do not mutate opts", function () {
      var opts = {
        protocol : 'mysql',
        user     : 'notauser',
        password : "wrong password",
        query    : { pool: true, debug: true }
      };

      var expected = JSON.stringify(opts);

      return ORM.connect(opts)
        .catch(function () {
          should.equal(
            JSON.stringify(opts),
            expected
          );
        });
    });

    it("should pass successful when opts is OK!", function () {
      return ORM.connect(common.getConnectionString())
        .then(function (db) {
          should.exist(db);

          db.use.should.be.a.Function();
          db.define.should.be.a.Function();
          db.sync.should.be.a.Function();
          db.load.should.be.a.Function();
        })
    });

  describe('POOL via connect', function () {
      var connStr = null;

      beforeEach(function () {
        connStr = common.getConnectionString();
      });

      afterEach(function () {
        connStr = null
      });

      if (protocol !== 'mongodb') {
        it("should understand pool `'false'` from query string", function () {
          var connString = connStr + "debug=false&pool=false";
          return ORM.connect(connString)
            .then(function (db) {
              should.strictEqual(db.driver.opts.pool,  false);
              should.strictEqual(db.driver.opts.debug, false);
            })
        });

        it("should understand pool `'0'` from query string", function () {
          var connString = connStr + "debug=0&pool=0";
          return ORM.connect(connString)
            .then(function (db) {
              should.strictEqual(db.driver.opts.pool,  false);
              should.strictEqual(db.driver.opts.debug, false);
            });
        });

        it("should understand pool `'true'` from query string", function () {
          var connString = connStr + "debug=true&pool=true";
          return ORM.connect(connString)
            .then(function (db) {
              should.strictEqual(db.driver.opts.pool,  true);
              should.strictEqual(db.driver.opts.debug, true);
            });
        });

        it("should understand pool `'1'` from query string", function () {
          var connString = connStr + "debug=1&pool=1";
          return ORM.connect(connString)
            .then(function (db) {
              should.strictEqual(db.driver.opts.pool,  true);
              should.strictEqual(db.driver.opts.debug, true);
            });
        });

        it("should understand pool `'true'` from connection object", function () {
          const config = _.extend(
            common.parseConnectionString(connStr),
            {
              protocol: common.protocol(),
              query: {
                pool: true, debug: true
              }
            }
          );

          return ORM.connect(config)
            .then(function (db) {
              should.strictEqual(db.driver.opts.pool,  true);
              should.strictEqual(db.driver.opts.debug, true);
            });
        });

        it("should understand pool `false` from connection options", function () {
          const config = _.extend(
            common.parseConnectionString(connStr),
            {
              protocol: common.protocol(),
              query: {
                pool: false, debug: false
              }
            }
          );

          return ORM.connect(config)
            .then(function (db) {
              should.strictEqual(db.driver.opts.pool,  false);
              should.strictEqual(db.driver.opts.debug, false);
            });
        });
      }
    });
  });

  describe("ORM.use()", function () {
    it("should be able to use an established connection", function () {
      var db = new sqlite.Database(':memory:');

      return ORM.use(db, "sqlite");
    });

    it("should be accept protocol alias", function () {
      var db = new pg.Client();

      return ORM.use(db, "pg")
    });

    it("should throw an error in callback if protocol not supported", function () {
      var db = new pg.Client();

      return ORM.use(db, "unknowndriver")
        .catch(function (err) {
          should.exist(err);
        });
    });
  });
});