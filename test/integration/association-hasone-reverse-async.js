var helper = require('../support/spec_helper');
var should = require('should');
var common = require('../common');
var _ = require('lodash');

describe("hasOne Async", function () {
  var db = null;
  var Person = null;
  var Pet = null;

  var setup = function (opts) {
    return async function () {
      Person = db.define('person', {
        name: String
      });
      Pet = db.define('pet', {
        name: String
      });
      Person.hasOne('pet', Pet, _.extend({
        reverse: 'owners',
        field: 'pet_id'
      }, opts || {}));

      await helper.dropSyncAsync([Person, Pet]);
      await Person.create([{ name: "John Doe" }, { name: "Jane Doe" }]);
      await Pet.create([{ name: "Deco" }, { name: "Fido" }]);
    };
  };

  before(async function () {
    db = await helper.connectAsync();
  });

  describe("reverse", function () {
    before(setup());

    it("should create methods in both models", function () {
      var person = Person(1);
      var pet = Pet(1);

      person.getPet.should.be.a.Function();
      person.setPet.should.be.a.Function();
      person.removePet.should.be.a.Function();
      person.hasPet.should.be.a.Function();

      pet.getOwners.should.be.a.Function();
      pet.setOwners.should.be.a.Function();
      pet.hasOwners.should.be.a.Function();
    });

    describe(".getAccessor()", function () {
      it("compare if model updated", async function () {
        var johnList = await Person.find({ name: "John Doe" });
        var decoList = await Pet.find({ name: "Deco" });

        var John = johnList[0];
        var Deco = decoList[0];

        should.exist(John);
        should.exist(Deco);

        (await Deco.hasOwners()).should.equal(false);
        await Deco.setOwners(John);

        var owners = await Deco.getOwners();
        should(Array.isArray(owners));
        owners.should.have.length(1);
        owners[0].should.eql(John);
      });
    });

    it("should be able to set an array of people as the owner", async function () {
      var owners = await Person.find({ name: ["John Doe", "Jane Doe"] });
      var fidoList = await Pet.find({ name: "Fido" });

      var Fido = fidoList[0];
      should.exist(Fido);

      (await Fido.hasOwners()).should.equal(false);
      await Fido.setOwners(owners);

      var ownersCopy = await Fido.getOwners();
      should(Array.isArray(ownersCopy));
      ownersCopy.should.have.length(2);

      var idProp = common.protocol() === 'mongodb' ? '_id' : 'id';
      var originalIds = owners.map(function (owner) { return owner[idProp]; }).sort();
      var copyIds = ownersCopy.map(function (owner) { return owner[idProp]; }).sort();
      copyIds.should.eql(originalIds);
    });
  });

  describe("reverse find", function () {
    before(setup());

    it("should be able to find given an association id", async function () {
      var johnList = await Person.find({ name: "John Doe" });
      var John = johnList[0];
      should.exist(John);

      var decoList = await Pet.find({ name: "Deco" });
      var Deco = decoList[0];
      should.exist(Deco);

      (await Deco.hasOwners()).should.equal(false);
      await Deco.setOwners(John);

      var ownersById = await Person.find({ pet_id: Deco[Pet.id] });
      should.exist(ownersById);
      should.exist(ownersById[0]);
      ownersById[0].name.should.equal(John.name);
    });

    it("should be able to find given an association instance", async function () {
      var johnList = await Person.find({ name: "John Doe" });
      var John = johnList[0];
      should.exist(John);

      var decoList = await Pet.find({ name: "Deco" });
      var Deco = decoList[0];
      should.exist(Deco);

      (await Deco.hasOwners()).should.equal(false);
      await Deco.setOwners(John);

      var ownersByInstance = await Person.find({ pet: Deco });
      should.exist(ownersByInstance[0]);
      ownersByInstance[0].name.should.equal(John.name);
    });

    it("should be able to find given a number of association instances with a single primary key", async function () {
      var johnList = await Person.find({ name: "John Doe" });
      var John = johnList[0];
      should.exist(John);

      var pets = await Pet.find();
      should.exist(pets);
      pets.length.should.equal(2);

      (await pets[0].hasOwners()).should.equal(false);
      await pets[0].setOwners(John);

      var owners = await Person.find({ pet: pets });
      should.exist(owners[0]);
      owners.length.should.equal(1);
      owners[0].name.should.equal(John.name);
    });

    it("should be able to find given a number of association instances with a multiple primary key", async function () {
      var johnList = await Person.find({
        name: "John Doe"
      });
      var John = johnList[0];
      should.exist(John);

      var pets = await Pet.find();
      should.exist(pets);

      (await pets[0].hasOwners()).should.equal(false);
      await pets[0].setOwners(John);

      var owners = await Person.find({ pet: pets });
      should.exist(owners[0]);
      owners[0].name.should.equal(John.name);
    });
  });
});
