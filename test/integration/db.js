var should = require('should');
var path = require('path');
var helper = require('../support/spec_helper');
var sinon = require('sinon');
var common = require('../common');

describe("db.driver", function () {
  var db = null;

  before(function (done) {
    helper.connect(async function (connection) {
      db = connection;

      var Log = db.define('log', {
        what: { type: 'text' },
        when: { type: 'date', time: true },
        who: { type: 'text' }
      });

      try {
        await helper.dropSync(Log);
        await Log.create([
          { what: "password reset", when: new Date('2013/04/07 12:33:05'), who: "jane" },
          { what: "user login", when: new Date('2013/04/07 13:01:44'), who: "jane" },
          { what: "user logout", when: new Date('2013/05/12 04:09:31'), who: "john" }
        ]);
        done();
      } catch (e) {
        done(e);
      }
    });
  });

  after(function () {
    return db.close();
  });

  it("should be available", function () {
    should.exist(db.driver);
  });

  if (common.protocol() === "mongodb") return;

  describe("query", function () {
    it("should be available", function () {
      should.exist(db.driver.query);
    });

    describe('#execQuery', function () {
      it('should execute sql queries', function () {
        return db.driver.execQuery('SELECT id FROM log')
          .then(function (data) {
            should(JSON.stringify(data) === JSON.stringify([{ id: 1 }, { id: 2 }, { id: 3 }]));
          })
      });

      it("should escape sql queries", function () {
        var query = "SELECT log.?? FROM log WHERE log.?? LIKE ? AND log.?? > ?";
        var args = ['what', 'who', 'jane', 'when', new Date('2013/04/07 12:40:00')];
        return db.driver.execQuery(query, args)
          .then(function (data) {
            should(JSON.stringify(data) === JSON.stringify([{ "what": "user login" }]));
          });
      });
    });

    describe('#eagerQuery', function () {
      if (common.protocol() === "redshift") return;
      var fixture = {
        association: {
          model: {
            table: 'dog'
          },
          field: {
            dog_id: {
              type: 'serial',
              key: true,
              required: false,
              klass: 'primary',
              enumerable: true,
              mapsTo: 'dog_id',
              name: 'dog_id'
            }
          },
          mergeAssocId: {
            family_id: {
              type: 'integer',
              required: true,
              klass: 'primary',
              enumerable: true,
              mapsTo: 'family_id',
              name: 'family_id'
            }
          },
          mergeTable: 'dog_family',
        },
        opts: {
          only: ['name', 'id'],
          keys: ['id'],
        },
        expectedQuery: {
          postgres: 'SELECT "t1"."name", "t1"."id", "t2"."dog_id" AS "$p" FROM "dog" "t1" JOIN "dog_family" "t2" ON "t2"."family_id" = "t1"."id" WHERE "t2"."dog_id" IN (1, 5)',
          mysql: 'SELECT `t1`.`name`, `t1`.`id`, `t2`.`dog_id` AS `$p` FROM `dog` `t1` JOIN `dog_family` `t2` ON `t2`.`family_id` = `t1`.`id` WHERE `t2`.`dog_id` IN (1, 5)',
          sqlite: 'SELECT `t1`.`name`, `t1`.`id`, `t2`.`dog_id` AS `$p` FROM `dog` `t1` JOIN `dog_family` `t2` ON `t2`.`family_id` = `t1`.`id` WHERE `t2`.`dog_id` IN (1, 5)'
        }
      };

      describe('cb', function () {
        it('should build correct query', function (done) {
          var execSimpleQueryStub = sinon.stub(db.driver, 'execSimpleQuery')
            .callsFake(function (q, cb) {
              cb();
            });

          db.driver.eagerQuery(fixture.association, fixture.opts, [1, 5], function (err, data) {
            if (err) {
              execSimpleQueryStub.restore();
              done(err);
            }
            should.equal(execSimpleQueryStub.calledOnce, true);
            should.equal(execSimpleQueryStub.lastCall.args[0], fixture.expectedQuery[common.protocol()]);
            execSimpleQueryStub.restore();
            done();
          });
        });
      });

      describe('promise', function () {
        it('should build correct query', function () {
          var execSimpleQueryStub = sinon.stub(db.driver, 'execSimpleQuery')
            .callsFake(function (q, cb) {
              if (typeof cb === 'function') {
                cb();
                return;
              }

              return Promise.resolve();
            });
          return db.driver.eagerQuery(fixture.association, fixture.opts, [1, 5])
            .then(function () {
              should.equal(execSimpleQueryStub.calledOnce, true);
              should.equal(execSimpleQueryStub.lastCall.args[0], fixture.expectedQuery[common.protocol()]);
            })
            .finally(function () {
              execSimpleQueryStub.restore();
            });
        });
      });
    });

    describe("#generateQuery", function () {
      it("should return interpolated & escaped SQL", function () {
        var expected = "expectation missing; unknown protocol " + common.protocol();

        switch (common.protocol()) {
          case 'mysql':
          case 'sqlite':
            expected = "UPDATE `animals` SET `name` = 'cat' WHERE `id` = 9"
            break;
          case 'postgres':
          case 'redshift':
            expected = 'UPDATE "animals" SET "name" = \'cat\' WHERE "id" = 9'
            break;
        }

        should.equal(
          db.driver.generateQuery("UPDATE ?? SET ?? = ? WHERE ?? = ?", ['animals', 'name', 'cat', 'id', 9]),
          expected,
        );
      });
    });

    describe("#execQuery", function () {
      it("should execute sql queries", function (done) {
        db.driver.execQuery("SELECT id FROM log", function (err, data) {
          should.not.exist(err);

          should(JSON.stringify(data) === JSON.stringify([{ id: 1 }, { id: 2 }, { id: 3 }]));
          done();
        });
      });

      it("should escape sql queries", function (done) {
        var query = "SELECT log.?? FROM log WHERE log.?? LIKE ? AND log.?? > ?";
        var args = ['what', 'who', 'jane', 'when', new Date('2013/04/07 12:40:00')];
        db.driver.execQuery(query, args, function (err, data) {
          should.not.exist(err);

          should(JSON.stringify(data) === JSON.stringify([{ "what": "user login" }]));
          done();
        });
      });
    });
  });

  describe('DB', function () {
    var db = null;
    beforeEach(function (done) {
      helper.connect(function (connection) {
        db = connection;

        return done();
      });
    });

    afterEach(function () {
      return db.close();
    });

    describe('db.sync()', function () {
      it('should call sync for each model', function () {
        db.define("my_model", {
          property: String
        });
        db.define("my_model2", {
          property: String
        });
        var syncStub = sinon.stub(db.models['my_model'], 'sync').resolves({});
        var syncStub2 = sinon.stub(db.models['my_model2'], 'sync').resolves({});
  return db.sync()
          .then(function () {
            should.equal(syncStub.calledOnce, true);
            should.equal(syncStub2.calledOnce, true);
          });
      });
    });

  describe("db.drop()", function () {
      it('should should call drop for each model', function () {
        db.define("my_model", {
          property: String
        });

        db.define("my_model2", {
          property: String
        });

        var dropStub = sinon.stub(db.models['my_model'], 'drop').resolves({});
        var dropStub2 = sinon.stub(db.models['my_model2'], 'drop').resolves({});

  return db.drop()
          .then(function () {
            should.equal(dropStub.calledOnce, true);
            should.equal(dropStub2.calledOnce, true);
          });
      });
    });

    describe("db.use()", function () {
      it("should be able to register a plugin", function (done) {
        var MyPlugin = require("../support/my_plugin");
        var opts = {
          option: true,
          calledDefine: false
        };

        db.use(MyPlugin, opts);

        db.define("my_model", { // db.define should call plugin.define method
          property: String
        });

        opts.calledDefine.should.be.true();

        return done();
      });

      it("a plugin should be able to catch models before defining them", function (done) {
        var MyPlugin = require("../support/my_plugin");
        var opts = {
          option: true,
          calledDefine: false,
          beforeDefine: function (name, props, opts) {
            props.otherprop = Number;
          }
        };

        db.use(MyPlugin, opts);

        var MyModel = db.define("my_model", { // db.define should call plugin.define method
          property: String
        });

        opts.calledDefine.should.be.true();
        MyModel.properties.should.have.property("otherprop");

        done();
      });

      it("should be able to register a plugin as string", function (done) {
        var opts = {
          option: true,
          calledDefine: false
        };

        db.use("../support/my_plugin", opts);

        db.define("my_model", { // db.define should call plugin.define method
          property: String
        });

        opts.calledDefine.should.be.true();

        return done();
      });
    });

    describe("db.define()", function () {
      it("should use setting model.namePrefix as table prefix if defined", function (done) {
        db.settings.set("model.namePrefix", "orm_");

        var Person = db.define("person", {
          name: String
        });

        Person.table.should.equal("orm_person");

        return done();
      });
    });
  });

  describe("db.load() as promise", function () {
    it("should require a file if array", function () {
      var filePath = "../support/spec_load";
  return db.load([filePath])
        .then(function () {
          db.models.should.have.property("person");
          db.models.should.have.property("pet");
        });
    });

    it("should require a file if single file path string", function () {
      var filePath = "../support/spec_load";
  return db.load(filePath)
        .then(function () {
          db.models.should.have.property("person");
          db.models.should.have.property("pet");
        });
    });

    it("should be able to load more than one file", function () {
      var filePaths = ["../support/spec_load_second", "../support/spec_load_third"];

  return db.load(filePaths)
        .then(function () {
          db.models.should.have.property("person");
          db.models.should.have.property("pet");
        });
    });

    it("should throw error if files passed like arguments", function () {
  return db.load("../support/spec_load_second", "../support/spec_load_third")
        .then(function () {
          db.models.should.have.property("person");
          db.models.should.have.property("pet");
        });
    });
  });

  describe("db.load()", function () {
    it("should require a file based on relative path", function (done) {
      db.load("../support/spec_load", function (err) {
        should.not.exist(err);

        db.models.should.have.property("person");
        db.models.should.have.property("pet");

        return done();
      });
    });

    it("should be able to load more than one file", function (done) {
      db.load("../support/spec_load_second", "../support/spec_load_third", function (err) {
        should.not.exist(err);

        db.models.should.have.property("person");
        db.models.should.have.property("pet");
        return done();
      });
    });
  });

  describe("db.load()", function () {
    it("should be able to load more than one file", function (done) {
      db.load("../support/spec_load_second", "../support/spec_load_third", function () {
        db.models.should.have.property("person");
        db.models.should.have.property("pet");

        return done();
      });
    });

    it("should be able to load more than one file passed as Array", function (done) {
      db.load(["../support/spec_load_second", "../support/spec_load_third"], function (err) {
        should.not.exist(err);

        db.models.should.have.property("person");
        db.models.should.have.property("pet");
        return done();
      });
    });
  });

  describe("db.load()", function () {
    it("should be able to load more than one file passed as Array", function (done) {
      db.load(["../support/spec_load_second", "../support/spec_load_third"], function () {
        db.models.should.have.property("person");
        db.models.should.have.property("pet");

        return done();
      });
    });
  });

  describe("db.serial()", function () {
    it("should be able to execute chains in serial", async function () {
      var Person = db.define("person", {
        name: String,
        surname: String
      });
  await helper.dropSync(Person);
      await Person.create([
        { name: "John", surname: "Doe" },
        { name: "Jane", surname: "Doe" }
      ]);

      var results = await db.serial(
        Person.find({ surname: "Doe" }),
        Person.find({ name: "John" })
      ).get();

      var DoeFamily = results[0];
      var JohnDoe = results[1];

      should(Array.isArray(DoeFamily));
      should(Array.isArray(JohnDoe));

      DoeFamily.length.should.equal(2);
      JohnDoe.length.should.equal(1);

      DoeFamily[0].surname.should.equal("Doe");
      DoeFamily[1].surname.should.equal("Doe");

      JohnDoe[0].name.should.equal("John");
    });
  });

});