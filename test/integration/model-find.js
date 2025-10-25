var should   = require('should');
var helper   = require('../support/spec_helper');
var ORM      = require('../../');

describe("Model Query Methods - Async API", function() {
  var db = null;
  var Person = null;

  var setup = function () {
    return async function () {
      Person = db.define("person", {
        name    : String,
        surname : String,
        age     : Number,
        male    : Boolean
      });

  await helper.dropSync(Person);
      
      await Person.create([{
        name    : "John",
        surname : "Doe",
        age     : 18,
        male    : true
      }, {
        name    : "Jane",
        surname : "Doe",
        age     : 16,
        male    : false
      }, {
        name    : "Jeremy",
        surname : "Dean",
        age     : 18,
        male    : true
      }, {
        name    : "Jack",
        surname : "Dean",
        age     : 20,
        male    : true
      }, {
        name    : "Jasmine",
        surname : "Doe",
        age     : 20,
        male    : false
      }]);
    };
  };

  before(function (done) {
    helper.connect(function (connection) {
      db = connection;
      return done();
    });
  });

  after(function () {
    return db.close();
  });

  describe("Model.find() - Basic", function () {
    before(setup());

    it("should return all items when called with no arguments", async function() {
      const people = await Person.find();
      people.should.be.a.Array();
      people.should.have.length(5);
    });

    it("should accept limit as number", async function() {
      const people = await Person.find().limit(2);
      people.should.be.a.Array();
      people.should.have.length(2);
    });

    it("should accept limit as argument", async function() {
      const people = await Person.find(2);
      people.should.be.a.Array();
      people.should.have.length(2);
    });

    it("should accept conditions", async function() {
      const people = await Person.find({ surname: "Doe" });
      people.should.be.a.Array();
      people.should.have.length(3);
    });

    it("should accept ordering as string property", async function() {
      const people = await Person.find("age");
      people.should.be.a.Array();
      people.should.have.length(5);
      people[0].age.should.equal(16);
      people[4].age.should.equal(20);
    });

    it("should accept ordering descending with '-' prefix", async function() {
      const people = await Person.find("-age");
      people.should.be.a.Array();
      people.should.have.length(5);
      people[0].age.should.equal(20);
      people[4].age.should.equal(16);
    });

    it("should accept ordering as Array", async function() {
      const people = await Person.find(["age"]);
      people.should.be.a.Array();
      people.should.have.length(5);
      people[0].age.should.equal(16);
      people[4].age.should.equal(20);
    });

    it("should accept multiple ordering with 'Z' for descending", async function() {
      const people = await Person.find(["age", "name", "Z"]);
      people.should.be.a.Array();
      people.should.have.length(5);
    });

    it("should filter with conditions", async function() {
      const people = await Person.find({ age: 18 });
      people.should.have.length(2);
      people[0].age.should.equal(18);
      people[1].age.should.equal(18);
    });
  });

  describe("Model.find() - Chaining", function () {
    before(setup());

    it("should support .limit()", async function() {
      const people = await Person.find().limit(3);
      people.should.have.length(3);
    });

    it("should support .offset()", async function() {
      const people = await Person.find().offset(2);
      people.should.have.length(3);
    });

    it("should support .skip() as alias for offset()", async function() {
      const people = await Person.find().skip(2);
      people.should.have.length(3);
    });

    it("should support .order()", async function() {
      const people = await Person.find().order("age");
      people[0].age.should.be.lessThan(people[1].age);
    });

    it("should support chaining multiple methods", async function() {
      const people = await Person.find().where({ male: true }).order("-age").limit(2);
      people.should.have.length(2);
      people[0].male.should.equal(true);
    });

    it("should support .where()", async function() {
      const people = await Person.find().where({ surname: "Doe" });
      people.should.have.length(3);
    });

    it("should support .count() in chain", async function() {
      const count = await Person.find({ surname: "Doe" }).count();
      count.should.equal(3);
    });

    it("should support .first() to get first item", async function() {
      const person = await Person.find().order("age").first();
      should.exist(person);
      person.age.should.equal(16);
    });

    it("should support .last() to get last item", async function() {
      const person = await Person.find().order("age").last();
      should.exist(person);
      person.age.should.equal(20);
    });

    it("should support .remove() to delete matching records", async function() {
      // Create a test record first
      await Person.create({ name: "ToRemove", age: 25 });
      const removed = await Person.find({ name: "ToRemove" }).remove();
      const check = await Person.find({ name: "ToRemove" });
      check.should.have.length(0);
    });
  });

  describe("Model.one()", function () {
    before(setup());

    it("should return single matching record", async function() {
      const person = await Person.one({ name: "Jane" });
      should.exist(person);
      person.name.should.equal("Jane");
    });

    it("should return null if no match", async function() {
      const person = await Person.one({ name: "NonExistent" });
      should.not.exist(person);
    });
  });

  describe("Model.get()", function () {
    beforeEach(async function() {
      testPerson = (await Person.find({ name: "John" }))[0];
    });

    it("should retrieve by ID", async function() {
      const person = await Person.get(testPerson.id);
      should.exist(person);
      person.name.should.equal("John");
    });
  });

  describe("Model.count()", function () {
    before(setup());

    it("should return total count of records", async function() {
      const count = await Person.count();
      count.should.equal(5);
    });

    it("should support simple conditions", async function() {
      const count = await Person.count({ age: 18 });
      count.should.equal(2);
    });

    // Note: Comparison operators (>, <, >=, <=) are tested in async-only-api.js
    // See: "Advanced Query Methods" describe block
  });

  describe("Model.exists()", function () {
    let testPersonId;

    before(setup());

    beforeEach(async function() {
      testPersonId = (await Person.find({ name: "John" }))[0].id;
    });

    it("should return true if record exists", async function() {
      const exists = await Person.exists(testPersonId);
      exists.should.equal(true);
    });

    it("should return false if record doesn't exist", async function() {
      const exists = await Person.exists(99999);
      exists.should.equal(false);
    });

    it("should support condition object", async function() {
      const exists = await Person.exists({ name: "John" });
      exists.should.equal(true);
    });
  });
});
