var should   = require('should');
var helper   = require('../support/spec_helper');
var ORM      = require('../../');

describe("Model.extendsTo()", function() {
  var db = null;
  var Person = null;
  var PersonAddress = null;

  var setup = function () {
    return async function () {
      Person = db.define("person", {
        name   : String
      });
      PersonAddress = Person.extendsTo("address", {
        street : String,
        number : Number
      });

      ORM.singleton.clear();

      await helper.dropSyncAsync([ Person, PersonAddress ]);
      
      const person = await Person.create({
        name: "John Doe"
      });

      await person.setAddressAsync(new PersonAddress({
        street : "Liberty",
        number : 123
      }));
    };
  };

  before(async function () {
    db = await helper.connectAsync();
  });

  after(async function () {
    await db.close();
  });

  describe("when calling hasAccessorAsync", function () {
    before(setup());

    it("should return true if found", async function () {
      const John = await Person.find().first();
      const hasAddress = await John.hasAddressAsync();
      should.equal(hasAddress, true);
    });

    it("should return error if instance not with an ID", async function () {
      var Jane = new Person({
        name: "Jane"
      });

      try {
        await Jane.hasAddressAsync();
        should.fail("Expected not defined error");
      } catch (err) {
        err.should.be.a.Object();
        should.equal(Array.isArray(err), false);
        err.should.have.property("code", ORM.ErrorCodes.NOT_DEFINED);
      }
    });
  });

  describe("when calling getAccessorAsync", function () {
    before(setup());

    it("should return extension if found", async function () {
      const John = await Person.find().first();
      const Address = await John.getAddressAsync();
      Address.should.be.a.Object();
      should.equal(Array.isArray(Address), false);
      Address.should.have.property("street", "Liberty");
    });

    it("should return error if not found", async function () {
      const John = await Person.find().first();
      await John.removeAddressAsync();
      
      try {
        await John.getAddressAsync();
        should.fail("Should have thrown an error");
      } catch(err) {
        err.should.be.a.Object();
        err.should.have.property("code", ORM.ErrorCodes.NOT_FOUND);
      }
    });

    it("should return error if instance not with an ID", async function () {
      var Jane = new Person({
        name: "Jane"
      });
      try {
        await Jane.getAddressAsync();
        should.fail("Expected not defined error");
      } catch (err) {
        err.should.be.a.Object();
        err.should.have.property("code", ORM.ErrorCodes.NOT_DEFINED);
      }
    });
  });

  describe("when calling setAccessorAsync", function () {
    before(setup());

    it("should remove any previous extension", async function () {
      const John = await Person.find().first();
      const count = await PersonAddress.find({ number: 123 }).count();
      count.should.equal(1);

      const addr = new PersonAddress({
        street : "4th Ave",
        number : 4
      });

  await John.setAddressAsync(addr);
      const Address = await John.getAddressAsync();
      Address.should.be.a.Object();
      should.equal(Array.isArray(Address), false);
      Address.should.have.property("street", addr.street);
      
      const addres = await PersonAddress.find({ number: 123 }).run();
      addres.length.should.equal(0);
    });
  });

  describe("when calling delAccessor + Async", function () {
    before(setup());

    it("should remove any extension", async function () {
      const John = await Person.find().first();
      const count = await PersonAddress.find({ number: 123 }).count();
      count.should.equal(1);

      await John.removeAddressAsync();
      const addres = await PersonAddress.find({ number: 123 }).run();
      addres.length.should.equal(0);
    });

    it("should return error if instance not with an ID", async function () {
      var Jane = new Person({
        name: "Jane"
      });
      try {
        await Jane.removeAddressAsync();
        should.fail("Expected not defined error");
      } catch (err) {
        err.should.be.a.Object();
        err.should.have.property("code", ORM.ErrorCodes.NOT_DEFINED);
      }
    });
  });
});
