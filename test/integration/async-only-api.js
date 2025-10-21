/**
 * Async-Only API Demo Test
 * 
 * This test demonstrates the new async-only API for node-orm3 v10
 * All methods now return Promises and use async/await patterns
 */

const should = require('should');
const helper = require('../support/spec_helper');
const common = require('../common');
const ORM = require('../../');

describe("Async-Only API (v10)", function() {
  let db = null;
  let Person = null;
  let Animal = null;

  // Setup database connection and models
  before(async function() {
    db = await helper.connectAsync();
  });

  // Teardown database connection
  after(async function() {
    if (db) {
      await db.close();
    }
  });

  describe("ORM Connection Methods", function() {
    it("should use async ping()", async function() {
      should(db.ping).be.a.Function();
      const result = db.ping();
      should(result).be.a.Promise();
      await result;
    });

    it("should use async close()", async function() {
  const testDb = await ORM.connect(common.getConnectionString());
      should(testDb.close).be.a.Function();
      const result = testDb.close();
      should(result).be.a.Promise();
      await result;
    });

    it("should use async sync()", async function() {
      should(db.sync).be.a.Function();
      const result = db.sync();
      should(result).be.a.Promise();
      await result;
    });
  });

  describe("Model Definition & Sync", function() {
    before(async function() {
      Person = db.define("person", {
        name: String,
        age: Number
      });

      Animal = db.define("animal", {
        name: String,
        species: String
      });

      ORM.singleton.clear();

      // Use async drop and sync
      await helper.dropSyncAsync([Person, Animal]);
    });

    it("should define models", function() {
      should.exist(Person);
      should.exist(Animal);
      should(Person.sync).be.a.Function();
      should(Animal.sync).be.a.Function();
    });

    it("should have async-only sync() method", function() {
      const result = Person.sync();
      should(result).be.a.Promise();
    });
  });

  describe("Create, Read, Update", function() {
    before(async function() {
      await helper.dropSyncAsync(Person);
    });

    it("should create instances with async create()", async function() {
      const person = await Person.create({
        name: "John Doe",
        age: 30
      });

      should.exist(person);
      should(person.name).equal("John Doe");
      should(person.age).equal(30);
    });

    it("should create multiple instances with async create()", async function() {
      const people = await Person.create([
        { name: "Jane Doe", age: 28 },
        { name: "Bob Smith", age: 35 }
      ]);

      should(people).be.an.Array();
      should(people).have.length(2);

      const total = await Person.count();
      should(total).equal(3);
    });

    it("should find instances with async find()", async function() {
      const instances = await Person.find({ name: "John Doe" });

      should(instances).be.an.Array();
      should(instances).have.length(1);
      should(instances[0].name).equal("John Doe");
    });

    it("should get one instance with async one()", async function() {
      const person = await Person.one({ name: "Jane Doe" });

      should.exist(person);
      should(person.name).equal("Jane Doe");
      should(person.age).equal(28);
    });

    it("should get instance by ID with async get()", async function() {
      const created = await Person.create({ name: "Test User", age: 25 });
      const retrieved = await Person.get(created.id);

      should.exist(retrieved);
      should(retrieved.name).equal("Test User");
    });

    it("should count instances with async count()", async function() {
      const count = await Person.count();

      should(count).be.a.Number();
      should(count).be.greaterThan(0);
    });

    it("should check existence with async exists()", async function() {
      const exists = await Person.exists(1);

      should(exists).be.a.Boolean();
    });
  });

  describe("Instance Methods", function() {
    let testPerson;

    before(async function() {
      await helper.dropSyncAsync(Person);
      testPerson = await Person.create({ name: "Instance Test", age: 30 });
    });

    it("should save instance changes with async save()", async function() {
      testPerson.age = 31;
      const result = testPerson.save();
      should(result).be.a.Promise();
      await result;

      const reloaded = await Person.get(testPerson.id);
      should(reloaded.age).equal(31);
    });

    it("should validate instance with async validate()", async function() {
      const errors = await testPerson.validate();

      should(errors).be.an.Array();
    });

    it("should remove instance with async remove()", async function() {
      const toRemove = await Person.create({ name: "To Remove", age: 99 });
      const result = toRemove.remove();
      should(result).be.a.Promise();
      await result;

      const exists = await Person.exists(toRemove.id);
      should(exists).be.false();
    });
  });

  describe("Advanced Query Methods", function() {
    before(async function() {
      await helper.dropSyncAsync(Person);
      await Person.create([
        { name: "Alice", age: 25 },
        { name: "Bob", age: 30 },
        { name: "Charlie", age: 35 }
      ]);
    });

    it("should use ChainFind.run() async", async function() {
      const chain = Person.find().limit(2);
      const result = chain.run();
      should(result).be.a.Promise();

      const instances = await result;
      should(instances).be.an.Array();
      should(instances.length).equal(2);
    });

    it("should use ChainFind.count() async", async function() {
      const chain = Person.find({ age: { ">": 25 } });
      const result = chain.count();
      should(result).be.a.Promise();

      const count = await result;
      should(count).be.a.Number();
      should(count).equal(2);
    });
  });

  describe("Bulk Operations", function() {
    before(async function() {
      await helper.dropSyncAsync(Person);
    });

    it("should clear all records with async clear()", async function() {
      await Person.create([
        { name: "To Clear 1", age: 20 },
        { name: "To Clear 2", age: 21 }
      ]);

      const result = Person.clear();
      should(result).be.a.Promise();
      await result;

      const count = await Person.count();
      should(count).equal(0);
    });

    it("should drop table with async drop()", async function() {
      const result = Person.drop();
      should(result).be.a.Promise();
      await result;
    });
  });

  describe("API Consistency", function() {
    it("should not have callback versions in public API", function() {
      // These should not exist or should be internal only
      should(typeof Person.findAsync).equal('undefined');
      should(typeof Person.createAsync).equal('undefined');
      should(typeof Person.countAsync).equal('undefined');
      should(typeof Person.clearAsync).equal('undefined');
    });

    it("all main methods should be async-capable", function() {
      const findResult = Person.find();
      should.exist(findResult);
      should(findResult.run).be.a.Function(); // ChainFind has run()
      
      const countResult = Person.count();
      should(countResult).be.a.Promise();
      
      const createResult = Person.create({});
      should(createResult).be.a.Promise();
    });
  });
});

