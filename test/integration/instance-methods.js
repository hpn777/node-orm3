var should   = require('should');
var helper   = require('../support/spec_helper');

describe("Instance Methods - Async API", function() {
  var db = null;
  var Person = null;

  before(function (done) {
    helper.connect(function (connection) {
      db = connection;

      Person = db.define("person", {
        name: String,
        age: Number,
        email: String
      });

      return helper.dropSyncAsync(Person).then(() => done());
    });
  });

  after(function () {
    return db.close();
  });

  describe("Instance.save()", function () {
    it("should save a new instance", async function() {
      const person = new Person({ name: "John", age: 30 });
      await person.save();
      
      person.id.should.not.be.undefined();
      person.isPersisted().should.equal(true);
    });

    it("should save an existing instance with changes", async function() {
      const person = await Person.create({ name: "Jane", age: 25 });
      person.age = 26;
      
      await person.save();
      
      const reloaded = await Person.get(person.id);
      reloaded.age.should.equal(26);
    });

    it("should track dirty properties", async function() {
      const person = await Person.create({ name: "Bob", age: 30 });
      person.dirtyProperties.should.have.length(0);
      
      person.age = 31;
      person.dirtyProperties.should.have.length(1);
      person.dirtyProperties[0].should.equal("age");
      
      await person.save();
      person.dirtyProperties.should.have.length(0);
    });
  });

  describe("Instance.validate()", function () {
    it("should return empty array for valid instance", async function() {
      const person = new Person({ name: "John", age: 30 });
      const errors = await person.validate();
      
      should.exist(errors);
      errors.should.be.an.Array();
      errors.should.have.length(0);
    });

    it("should return errors array for invalid instance", async function() {
      const person = new Person();
      const errors = await person.validate();
      
      should.exist(errors);
      errors.should.be.an.Array();
    });
  });

  describe("Instance.remove()", function () {
    it("should remove an instance", async function() {
      const person = await Person.create({ name: "ToRemove", age: 50 });
      const personId = person.id;
      
      await person.remove();
      
      const exists = await Person.exists(personId);
      exists.should.equal(false);
    });

    it("should work after save", async function() {
      const person = new Person({ name: "TempPerson", age: 40 });
      await person.save();
      const personId = person.id;
      
      await person.remove();
      
      const exists = await Person.exists(personId);
      exists.should.equal(false);
    });
  });

  describe("Instance.isPersisted()", function () {
    it("should return false for new instance", async function() {
      const person = new Person({ name: "NewPerson", age: 20 });
      person.isPersisted().should.equal(false);
    });

    it("should return true after save", async function() {
      const person = new Person({ name: "SavedPerson", age: 25 });
      await person.save();
      person.isPersisted().should.equal(true);
    });

    it("should return true for fetched instance", async function() {
      const created = await Person.create({ name: "FetchedPerson", age: 35 });
      const fetched = await Person.get(created.id);
      fetched.isPersisted().should.equal(true);
    });
  });

  describe("Instance.isDirty()", function () {
    it("should return false for new clean instance", async function() {
      const person = new Person({ name: "Clean", age: 30 });
      person.isDirty().should.equal(true); // Has changes on creation
    });

    it("should return true after modification", async function() {
      const person = await Person.create({ name: "Bob", age: 30 });
      person.isDirty().should.equal(false);
      
      person.age = 31;
      person.isDirty().should.equal(true);
    });

    it("should return false after save", async function() {
      const person = new Person({ name: "ToSave", age: 40 });
      await person.save();
      person.isDirty().should.equal(false);
    });
  });

  describe("Instance.markAsDirty()", function () {
    it("should mark instance as dirty", async function() {
      const person = await Person.create({ name: "MarkTest", age: 50 });
      person.isDirty().should.equal(false);
      
      person.markAsDirty("age");
      person.isDirty().should.equal(true);
      person.dirtyProperties.should.containEql("age");
    });
  });

  describe("Instance.saved()", function () {
    it("should return true for persisted instance", async function() {
      const person = await Person.create({ name: "Saved", age: 30 });
      person.saved().should.equal(true);
    });

    it("should return false for new instance", async function() {
      const person = new Person({ name: "NotSaved", age: 25 });
      person.saved().should.equal(false);
    });
  });
});
