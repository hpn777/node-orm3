var _      = require('lodash');
var should = require('should');
var Driver = require('../../../dist/Drivers/DML/mysql').Driver;
var helper = require('../../support/spec_helper');
var common = require('../../common');

if (common.protocol() != "mysql") return;

describe("MySQL driver", function() {
  let db;
  let driver;

  const simpleObj = function (obj) {
    return JSON.parse(JSON.stringify(obj));
  }

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
      should.deepEqual(simpleObj(data), [{ 'count(*)': 1 }]);
    });

    it("#execSimpleQueryAsync should run query", async function () {
      const data = await driver.execSimpleQueryAsync("SELECT count(*)");
      should.deepEqual(simpleObj(data), [{ 'count(*)': 1 }]);
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
      should.deepEqual(simpleObj(data), [{ name: 'jane' }]);
    });

    it("#findAsync should work", async function () {
      const data = await driver.findAsync(['name'], 'abc', { name: 'jane' }, {});
      should.deepEqual(simpleObj(data), [{ name: 'jane' }]);
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
      should.deepEqual(simpleObj(data), [{ c: 3 }]);
    });

    it("#countAsync should work", async function () {
      const data = await driver.countAsync('abc', {}, {});
      should.deepEqual(simpleObj(data), [{ c: 3 }]);
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
      should.deepEqual(simpleObj(data), [{ 'count(*)': 1 }]);
    });

    it("#insertAsync should work", async function () {
      await driver.insertAsync('abc', { name: 'jane' }, null);
      const data = await driver.execSimpleQueryAsync("SELECT count(*) FROM abc");
      should.deepEqual(simpleObj(data), [{ 'count(*)': 1 }]);
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
      should.deepEqual(simpleObj(data), [{ 'count(*)': 2 }]);
    });

    it("#updateAsync should work", async function () {
      await driver.updateAsync('abc', { name: 'bob' }, { name: 'jane' });
      const data = await driver.execSimpleQueryAsync("SELECT count(*) FROM abc WHERE name = 'bob'");
      should.deepEqual(simpleObj(data), [{ 'count(*)': 2 }]);
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
      should.deepEqual(simpleObj(data), [{ name: 'alice' }, { name: 'jane' }]);
    });

    it("#removeAsync should work", async function () {
      await driver.removeAsync('abc', { name: 'bob' });
      const data = await driver.execSimpleQueryAsync("SELECT name FROM abc ORDER BY name");
      should.deepEqual(simpleObj(data), [{ name: 'alice' }, { name: 'jane' }]);
    });
  });

  describe("clear", function () {
    beforeEach(async function () {
      await driver.execSimpleQueryAsync("DROP TABLE IF EXISTS abc");
      await driver.execSimpleQueryAsync("CREATE TABLE abc (name varchar(100))");
      await driver.execSimpleQueryAsync("INSERT INTO abc VALUES ('jane'), ('bob'), ('alice')");
    });

    it("#clear should work", async function () {
      await driver.clear('abc');
      const data = await driver.execSimpleQuery("SELECT count(*) FROM abc");
      should.deepEqual(simpleObj(data), [{ 'count(*)': 0 }]);
    });

    it("#clearAsync should work", async function () {
      await driver.clearAsync('abc');
      const data = await driver.execSimpleQueryAsync("SELECT count(*) FROM abc");
      should.deepEqual(simpleObj(data), [{ 'count(*)': 0 }]);
    });
  });

});
