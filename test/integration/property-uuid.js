var _        = require('lodash');
var should   = require('should');
var helper   = require('../support/spec_helper');
var common   = require('../common');
var ORM      = require('../../');

if (common.protocol() !== "postgres") return;

describe("Property", function() {
  describe("type uuid", function () {
    var db = null;

    before(async function () {
      db = await helper.connectAsync();
    });

    after(async function () {
      await db.close();
    });

    var Thing = null;

    before(async function () {
      await db.driver.execQueryAsync('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

      Thing = db.define('thing', {
        id:   { type: 'uuid', key: true, defaultExpression: 'uuid_generate_v4()' },
        //id:   { type: 'serial' },
        name: { type: 'text' }
      });

      await helper.dropSyncAsync(Thing);
    });

    it("should create the table", function () {
      should(true);
    });

    var infoSQL = "SELECT * FROM information_schema.columns WHERE table_name = 'thing' AND column_name = 'id'";

    it("should have the correct type", async function () {
      const cols = await db.driver.execQueryAsync(infoSQL);

      var uuidCol = cols[0];

      should.exist(uuidCol);
      should.equal(uuidCol.data_type, 'uuid');
    });

    it("should have the correct default value", async function () {
      const cols = await db.driver.execQueryAsync(infoSQL);

      var uuidCol = cols[0];

      should.exist(uuidCol);
      should.equal(uuidCol.column_default, 'uuid_generate_v4()');
    });

    it("should set id automatically", async function () {
      const chair = await Thing.create({ name: 'chair' });

      const items = await Thing.find().run();
      should.equal(items.length, 1);
      should.equal(items[0].name, 'chair');
      items[0].id.should.match(/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i);
      chair.id.should.equal(items[0].id);
    });

    it("should save", async function () {
      const horse = await Thing.create({ name: 'horse' });

      const fetched = await Thing.get(horse.id);
      should.exist(fetched);
      fetched.name = 'horsey';
      await fetched.save();

      const updated = await Thing.get(horse.id);
      should.exist(updated);
      should.equal(updated.id, horse.id);
      should.equal(updated.name, 'horsey');
    });

  });
});
