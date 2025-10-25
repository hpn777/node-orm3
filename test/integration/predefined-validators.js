var should     = require('should');
var helper     = require('../support/spec_helper');
var ORM        = require('../../');
var validators = ORM.validators;
var common = require('../common');
var protocol = common.protocol().toLowerCase();

function checkValidation(expected) {
  return function (returned) {
    should.equal(returned, expected);
  };
}

describe("Predefined Validators", function () {

  describe("equalToProperty('name')", function () {
    it("should pass if equal", function () {
      validators.equalToProperty('name').call({ name: "John Doe" }, 'John Doe', checkValidation());
    });
    it("should not pass if not equal", function () {
      validators.equalToProperty('name').call({ name: "John" }, 'John Doe', checkValidation('not-equal-to-property'));
    });
    it("should not pass even if equal to other property", function () {
      validators.equalToProperty('name').call({ surname: "John Doe" }, 'John Doe', checkValidation('not-equal-to-property'));
    });
  });

  describe("unique()", function () {
      if (protocol === "mongodb") return;

    var db = null;
    var Person = null;

    before(async function () {
  db = await helper.connect();
      Person = db.define("person", {
        name    : String,
        surname : String
      }, {
        validations: {
          surname: validators.unique()
        }
      });

      Person.settings.set("instance.returnAllErrors", false);
    });

    beforeEach(async function () {
      ORM.singleton.clear();
  await helper.dropSync(Person);
      await Person.create({
        name    : "John",
        surname : "Doe"
      });
    });

    after(async function () {
      await db.close();
    });

    it("should not pass if more elements with that property exist", async function () {
      var janeDoe = new Person({
        name    : "Jane",
        surname : "Doe" // <-- in table already!
      });

      try {
        await janeDoe.save();
        should.fail("Expected unique validation error");
      } catch (err) {
        err.should.be.a.Object();
        should.equal(Array.isArray(err), false);
        err.should.have.property("property", "surname");
        err.should.have.property("value",    "Doe");
        err.should.have.property("msg",      "not-unique");
      }
    });

    it("should pass if no more elements with that property exist", async function () {
      var janeDean = new Person({
        name    : "Jane",
        surname : "Dean" // <-- not in table
      });

      const result = await janeDean.save();
      should.exist(result);
    });

    it("should pass if resaving the same instance", async function () {
      var Johns = await Person.find({ name: "John", surname: "Doe" }).run();
      should.equal(Johns.length, 1);

      Johns[0].surname = "Doe"; // forcing resave

      const saved = await Johns[0].save();
      should.exist(saved);
    });
  });

});
