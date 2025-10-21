var should   = require('should');
var helper   = require('../support/spec_helper');
var ORM      = require('../../');

describe("Model.clear()", function() {
  var db = null;
  var Person = null;

  var setup = function () {
    return async function () {
      Person = db.define("person", {
        name   : String
      });

      ORM.singleton.clear();

      await helper.dropSyncAsync(Person);
      await Person.create([
        { name: "John Doe" },
        { name: "Jane Doe" }
      ]);
    };
  };

  before(async function () {
    db = await helper.connectAsync();
  });

  after(async function () {
    await db.close();
  });

  describe("clearing records", function () {
    beforeEach(setup());

    it("should clear all records", async function () {
      await Person.clear();
      const count = await Person.count();
      should.equal(count, 0);
    });

    it("should return a Promise", function () {
      const result = Person.clear();
      should(result).be.a.Promise();
    });
  });
});
