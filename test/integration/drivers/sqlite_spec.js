var _      = require('lodash');
var should = require('should');
var Driver = require('../../../dist/Drivers/DML/sqlite').Driver;
var helper = require('../../support/spec_helper');
var common = require('../../common');

if (common.protocol() != "sqlite") return;

describe("Sqlite driver", function() {
  let db;
  let driver;

  before(async function () {
    db = await helper.connectAsync();
    driver = db.driver;
  });

  after(async function () {
    await db.close();
  });

  describe("execSimpleQuery", function () {
    it("#execSimpleQuery should run query", async function () {
      const data = await driver.execSimpleQuery("SELECT count(*)");
      should.deepEqual(data, [{ 'count(*)': 1 }]);
    });

    it("#execSimpleQueryAsync should run query", async function () {
      const data = await driver.execSimpleQueryAsync("SELECT count(*)");
      should.deepEqual(data, [{ 'count(*)': 1 }]);
    });
  });

  describe("ping", function () {
    it("#ping should work", async function () {
      await driver.ping();
    });

    it("#pingAsync should work", async function () {
      await driver.pingAsync();
    });
  });

  describe("find", function () {
    beforeEach(async function () {
      await driver.execSimpleQueryAsync("DROP TABLE IF EXISTS abc");
      await driver.execSimpleQueryAsync("CREATE TABLE abc (name varchar(100))");
      await driver.execSimpleQueryAsync("INSERT INTO abc VALUES ('jane'), ('bob'), ('alice')");
    });

    it("#find should work", async function () {
      const data = await driver.find(['name'], 'abc', { name: 'jane' }, {});
      should.deepEqual(data, [{ name: 'jane' }]);
    });

    it("#findAsync should work", async function () {
      const data = await driver.findAsync(['name'], 'abc', { name: 'jane' }, {});
      should.deepEqual(data, [{ name: 'jane' }]);
    });
  });

  describe("count", function () {
    beforeEach(async function () {
      await driver.execSimpleQueryAsync("DROP TABLE IF EXISTS abc");
      await driver.execSimpleQueryAsync("CREATE TABLE abc (name varchar(100))");
      await driver.execSimpleQueryAsync("INSERT INTO abc VALUES ('jane'), ('bob'), ('alice')");
    });

    it("#count should work", async function () {
      const data = await driver.count('abc', {}, {});
      should.deepEqual(data, [{ c: 3 }]);
    });

    it("#countAsync should work", async function () {
      const data = await driver.countAsync('abc', {}, {});
      should.deepEqual(data, [{ c: 3 }]);
    });
  });

  describe("insert", function () {
    beforeEach(async function () {
      await driver.execSimpleQueryAsync("DROP TABLE IF EXISTS abc");
      await driver.execSimpleQueryAsync("CREATE TABLE abc (name varchar(100))");
    });

    it("#insert should work", async function () {
      await driver.insert('abc', { name: 'jane' }, null);
      const data = await driver.execSimpleQuery("SELECT count(*) FROM abc");
      should.deepEqual(data, [{ 'count(*)': 1 }]);
    });

    it("#insertAsync should work", async function () {
      await driver.insertAsync('abc', { name: 'jane' }, null);
      const data = await driver.execSimpleQueryAsync("SELECT count(*) FROM abc");
      should.deepEqual(data, [{ 'count(*)': 1 }]);
    });
  });

  describe("update", function () {
    beforeEach(async function () {
      await driver.execSimpleQueryAsync("DROP TABLE IF EXISTS abc");
      await driver.execSimpleQueryAsync("CREATE TABLE abc (name varchar(100))");
      await driver.execSimpleQueryAsync("INSERT INTO abc VALUES ('jane'), ('bob'), ('alice')");
    });

    it("#update should work", async function () {
      await driver.update('abc', { name: 'bob' }, { name: 'jane' });
      const data = await driver.execSimpleQuery("SELECT count(*) FROM abc WHERE name = 'bob'");
      should.deepEqual(data, [{ 'count(*)': 2 }]);
    });

    it("#updateAsync should work", async function () {
      await driver.updateAsync('abc', { name: 'bob' }, { name: 'jane' });
      const data = await driver.execSimpleQueryAsync("SELECT count(*) FROM abc WHERE name = 'bob'");
      should.deepEqual(data, [{ 'count(*)': 2 }]);
    });
  });

  describe("remove", function () {
    beforeEach(async function () {
      await driver.execSimpleQueryAsync("DROP TABLE IF EXISTS abc");
      await driver.execSimpleQueryAsync("CREATE TABLE abc (name varchar(100))");
      await driver.execSimpleQueryAsync("INSERT INTO abc VALUES ('jane'), ('bob'), ('alice')");
    });

    it("#remove should work", async function () {
      await driver.remove('abc', { name: 'bob' });
      const data = await driver.execSimpleQuery("SELECT name FROM abc ORDER BY name");
      should.deepEqual(data, [{ name: 'alice' }, { name: 'jane' }]);
    });

    it("#removeAsync should work", async function () {
      await driver.removeAsync('abc', { name: 'bob' });
      const data = await driver.execSimpleQueryAsync("SELECT name FROM abc ORDER BY name");
      should.deepEqual(data, [{ name: 'alice' }, { name: 'jane' }]);
    });
  });

  describe("clear", function () {
    describe("without sqlite_sequence table", function () {
      beforeEach(async function () {
        await driver.execSimpleQueryAsync("DROP TABLE IF EXISTS abc");
        await driver.execSimpleQueryAsync("CREATE TABLE abc (name varchar(100))");
        await driver.execSimpleQueryAsync("INSERT INTO abc VALUES ('jane'), ('bob'), ('alice')");
      });

      it("#clear should work", async function () {
        await driver.clear('abc');
        const data = await driver.execSimpleQuery("SELECT count(*) FROM abc");
        should.deepEqual(data, [{ 'count(*)': 0 }]);
      });

      it("#clearAsync should work", async function () {
        await driver.clearAsync('abc');
        const data = await driver.execSimpleQueryAsync("SELECT count(*) FROM abc");
        should.deepEqual(data, [{ 'count(*)': 0 }]);
      });
    });

    describe("with sqlite_sequence table", function () {
      beforeEach(async function () {
        await driver.execSimpleQueryAsync("DROP TABLE IF EXISTS abc");
        await driver.execSimpleQueryAsync("CREATE TABLE abc (name varchar(100), id INTEGER PRIMARY KEY AUTOINCREMENT)");
        await driver.execSimpleQueryAsync("INSERT INTO abc VALUES ('jane', null), ('bob', null), ('alice', null)");
      });

      it("#clear should work", async function () {
        await driver.clear('abc');
        const data = await driver.execSimpleQuery("SELECT count(*) FROM abc");
        should.deepEqual(data, [{ 'count(*)': 0 }]);
      });

      it("#clearAsync should work", async function () {
        await driver.clearAsync('abc');
        const data = await driver.execSimpleQueryAsync("SELECT count(*) FROM abc");
        should.deepEqual(data, [{ 'count(*)': 0 }]);
      });
    });
  });

  describe("#valueToProperty", function () {
    describe("numbers", function () {
      describe("floats", function () {
        function valueToProperty (value) {
          return driver.valueToProperty(value, { type: 'number' });
        }

        it("should pass on empty string", function () {
          should.strictEqual(valueToProperty(''), '');
        });

        it("should pass on text", function () {
          should.strictEqual(valueToProperty('fff'), 'fff');
        });

        it("should pass on numbers", function () {
          should.strictEqual(valueToProperty(1.2), 1.2);
        });

        it("should parse numbers in strings", function () {
          should.strictEqual(valueToProperty('1.2'), 1.2);
          should.strictEqual(valueToProperty('1.200 '), 1.2);
        });

        it("should support non finite numbers", function () {
          should.strictEqual(valueToProperty( 'Infinity'),  Infinity);
          should.strictEqual(valueToProperty('-Infinity'), -Infinity);
          should.strictEqual(isNaN(valueToProperty('NaN')), true);
        });
      });

      describe("integers", function () {
        function valueToProperty (value) {
          return driver.valueToProperty(value, { type: 'integer' });
        }

        it("should pass on empty string", function () {
          should.strictEqual(valueToProperty(''), '');
        });

        it("should pass on text", function () {
          should.strictEqual(valueToProperty('fff'), 'fff');
        });

        it("should pass on non finite numbers as text", function () {
          should.strictEqual(valueToProperty( 'Infinity'),  'Infinity');
          should.strictEqual(valueToProperty('-Infinity'), '-Infinity');
          should.strictEqual(valueToProperty('NaN'), 'NaN');
        });

        it("should pass on numbers", function () {
          should.strictEqual(valueToProperty(1.2), 1.2);
        });

        it("should parse integers in strings", function () {
          should.strictEqual(valueToProperty('1.2'), 1);
          should.strictEqual(valueToProperty('1.200 '), 1);
        });
      });

      describe("date", function () {
        var timezone = /GMT([+/-]\d{4})/.exec(new Date().toString())[1];

        function valueToProperty (value) {
          return driver.valueToProperty(value, { type: 'date' });
        }

        it("should return origin object when given non-string", function () {
          var now = new Date();
          should.strictEqual(valueToProperty(now), now);
          var array = [];
          should.strictEqual(valueToProperty(array), array);
          var obj = {};
          should.strictEqual(valueToProperty(obj), obj);
        })

        it("should pass on normal time", function () {
          var normal = '2017-12-07 00:00:00';
          should.strictEqual(valueToProperty(normal).toString(), new Date(normal).toString());
        })

        it("should pass on utc time by orm saved with local config", function () {
          var utc = '2017-12-07T00:00:00';
          should.strictEqual(valueToProperty(utc+'Z').toString(), new Date(utc+timezone).toString());
        })

        it("should pass on utc time by orm saved with timezone config", function () {
          var utc = '2017-12-07T00:00:00';
          driver.config.timezone = timezone;
          should.strictEqual(valueToProperty(utc+'Z').toString(), new Date(utc+timezone).toString());
          driver.config.timezone = '';
        })
      });
    });
  });

  describe("db", function () {
    var dbInstance = null;
    var Person = null;

    before(async function () {
      dbInstance = await helper.connectAsync();

      Person = dbInstance.define("person", {
        name: String
      });

      await helper.dropSyncAsync([Person]);
    });

    after(async function () {
      await dbInstance.close();
    });

    describe("#clear", function () {
      beforeEach(async function () {
        await Person.create([{ name: 'John' }, { name: 'Jane' }]);
        const count = await Person.count();
        should.equal(count, 2);
      });

      afterEach(async function () {
        await helper.dropSyncAsync(Person);
      });

      it("should drop all items", async function () {
        await Person.clear();
        const count = await Person.count();
        should.equal(count, 0);
      });

      it("should reset id sequence", async function () {
        await Person.clear();
        const person = await Person.create({ name: 'Bob' });
        should.equal(person.id, 1);
      });
    });
  });
});
