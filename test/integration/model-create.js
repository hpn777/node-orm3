var should   = require('should');
var sinon    = require('sinon');
var helper   = require('../support/spec_helper');

describe("Model.create() - Async API", function() {
  var db = null;
  var Pet = null;
  var Person = null;

  var setup = function () {
    return async function () {
      Person = db.define("person", {
        name   : String
      });
      Pet = db.define("pet", {
        name   : { type: "text", defaultValue: "Mutt" }
      });
      Person.hasMany("pets", Pet);

      return helper.dropSyncAsync([Person, Pet]);
    };
  };

  before(async function () {
    db = await new Promise(resolve => helper.connect(resolve));
  });

  after(async function () {
    await db.close();
  });

  afterEach(function () {
    sinon.restore();
  });

  describe("if passing an object", function () {
    before(setup());

    it("should accept it as the only item to create", async function() {
      const John = await Person.create({
        name : "John Doe"
      });

      John.should.have.property("name", "John Doe");
    });
  });

  describe("if passing an array", function () {
    before(setup());

    it("should accept it as a list of items to create", async function() {
      const people = await Person.create([{
        name : "John Doe"
      }, {
        name : "Jane Doe"
      }]);

      should(Array.isArray(people));
      people.should.have.property("length", 2);
      people[0].should.have.property("name", "John Doe");
      people[1].should.have.property("name", "Jane Doe");
    });
  });

  // Note: Association tests are covered in dedicated association test files
  // See: association-hasone-async.js, association-hasmany-async.js, etc.

  describe("when not passing a property", function () {
    before(setup());

    it("should use defaultValue if defined", async function() {
      const Mutt = await Pet.create({});
      Mutt.should.have.property("name", "Mutt");
    });
  });
});
