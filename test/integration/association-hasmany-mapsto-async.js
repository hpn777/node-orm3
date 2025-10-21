var should   = require('should');
var helper   = require('../support/spec_helper');
var common   = require('../common');

if (common.protocol() == "mongodb") return;   // Can't do mapsTo testing on mongoDB ()

describe("hasMany with MapsTo Async", function () {
  var db     = null;
  var Person = null;
  var Pet    = null;

  before(async function() {
    db = await helper.connectAsync();
  });

  after(async function() {
    await db.close();
  });

  var setup = function (opts) {
    opts = opts || {};

    return async function () {
      db.settings.set('instance.identityCache', false);

      Person = db.define('person', {
        id        : {type : "serial",  size:"8",    mapsTo: "personID", key:true},
        firstName : {type : "text",    size:"255",  mapsTo: "name"},
        lastName  : {type : "text",    size:"255",  mapsTo: "surname"},
        ageYears  : {type : "number",  size:"8",    mapsTo: "age"}
      });

      Pet = db.define('pet', {
        id      :  {type : "serial",   size:"8",    mapsTo:"petID", key:true},
        petName :  {type : "text",     size:"255",  mapsTo: "name"}
      });

      Person.hasMany('pets', Pet, {},
        { autoFetch:  opts.autoFetchPets,
          mergeTable: 'person_pet',
          mergeId: 'person_id',
          mergeAssocId: 'pet_id'});

      await helper.dropSyncAsync([ Person, Pet ]);
      
      //
      // John --+---> Deco
      //        '---> Mutt <----- Jane
      //
      // Justin
      //
      const John = await Person.create({
        firstName    : "John",
        lastName     : "Doe",
        ageYears     : 20
      });
      
      const Deco = await Pet.create({ petName: "Deco" });
      const Mutt = await Pet.create({ petName: "Mutt" });
      await John.addPetsAsync(Deco, Mutt);
      
      const Jane = await Person.create({
        firstName  : "Jane",
        lastName   : "Doe",
        ageYears   : 16
      });
      
      const Justin = await Person.create({
        firstName : "Justin",
        lastName  : "Dean",
        ageYears  : 18
      });
      
      await Jane.addPetsAsync(Mutt);
    };
  };

  describe("getAccessorAsync", function () {
    before(setup());

    it("should allow to specify order as string", function () {
      return Person.find({ firstName: "John" })
        .then(function (people) {
          return people[0].getPetsAsync("-petName");
        })
        .then(function (pets) {
          should(Array.isArray(pets));
          pets.length.should.equal(2);
          pets[0].model().should.equal(Pet);
          pets[0].petName.should.equal("Mutt");
          pets[1].petName.should.equal("Deco");
        });
    });

    it("should return proper instance model", function(){
      return Person.find({ firstName: "John" })
        .then(function (people) {
          return people[0].getPetsAsync("-petName");
        })
        .then(function (pets) {
          pets[0].model().should.equal(Pet);
        });
    });

    it("should allow to specify order as Array", function () {
      return Person.find({ firstName: "John" })
        .then(function (people) {
          return people[0].getPetsAsync([ "petName", "Z" ]);
        })
        .then(function (pets) {

          should(Array.isArray(pets));
          pets.length.should.equal(2);
          pets[0].petName.should.equal("Mutt");
          pets[1].petName.should.equal("Deco");
        });
    });

    it("should allow to specify a limit", function () {
      return Person.find({ firstName: "John" }).first()
        .then(function (John) {
          return John.getPetsAsync(1);
        })
        .then(function (pets) {
          should(Array.isArray(pets));
          pets.length.should.equal(1);
        });
    });

    it("should allow to specify conditions", function () {
      return Person.find({ firstName: "John" }).first()
        .then(function (John) {
          return John.getPetsAsync({ petName: "Mutt" });
        })
        .then(function (pets) {
          should(Array.isArray(pets));
          pets.length.should.equal(1);
          pets[0].petName.should.equal("Mutt");
        });
    });

    if (common.protocol() == "mongodb") return;

    it("should allow chaining count()", function () {
      return Person.find({})
        .then(function (people) {
          return Promise.all([people, people[0].getPetsAsync()]);
        })
        .then(function ([people, count]) {
          should.strictEqual(count.length, 2);
          return Promise.all([people, people[1].getPetsAsync()]);
        })
        .then(function ([people, count]) {
          should.strictEqual(count.length, 1);
          return people[2].getPetsAsync();
        })
        .then(function (count) {
          should.strictEqual(count.length, 0);
        });
    });
  });

  describe("hasAccessorAsync", function () {
    before(setup());

    it("should return true if instance has associated item", function () {
      Pet.find({ petName: "Mutt" })
        .then(function (pets) {
          return Promise.all([pets, Person.find({ firstName: "Jane" }).first()]);
        })
        .then(function ([pets, Jane]) {
          return Jane.hasPetsAsync(pets[0]);
        })
        .then(function (has_pets) {
          has_pets.should.equal(true);
        });
    });

    it("should return false if any passed instances are not associated", function () {
      Pet.find()
        .then(function (pets) {
          return Promise.all([pets, Person.find({ firstName: "Jane" }).first()]);
        })
        .then(function ([pets, Jane]) {
          return Jane.hasPetsAsync(pets);
        })
        .then(function (has_pets) {
          has_pets.should.be.false();
        });
    });
  });

  describe("delAccessorAsync", function () {
    before(setup());

    it("should accept arguments in different orders", function () {
      return Pet.find({ petName: "Mutt" })
        .then(function (pets) {
          return Promise.all([pets, Person.find({ firstName: "John" })]);
        })
        .then(function ([pets, people]) {
          return Promise.all([people, people[0].removePetsAsync(pets[0])]);
        })
        .then(function ([people]) {
          return people[0].getPetsAsync();
        })
        .then(function (pets) {
          should(Array.isArray(pets));
          pets.length.should.equal(1);
          pets[0].petName.should.equal("Deco");

        });
    });
  });

  describe("delAccessorAsync", function () {
    before(setup());

    it("should remove specific associations if passed", function () {
      return Pet.find({ petName: "Mutt" })
        .then(function (pets) {
          return Promise.all([pets, Person.find({ firstName: "John" })]);
        })
        .then(function ([pets, people]) {
          return Promise.all([people, people[0].removePetsAsync(pets[0])]);
        })
        .then(function ([people]) {
          return people[0].getPetsAsync();
        })
        .then(function (pets) {
          should(Array.isArray(pets));
          pets.length.should.equal(1);
          pets[0].petName.should.equal("Deco");
        });
    });

    it("should remove all associations if none passed", function () {
      return Person.find({ firstName: "John" }).first()
        .then(function (John) {
          return Promise.all([John, John.removePetsAsync()]);
        })
        .then(function ([John]) {
          return John.getPetsAsync();
        })
        .then(function (pets) {
          should(Array.isArray(pets));
          pets.length.should.equal(0);
        });
    });
  });

  describe("addAccessorAsync", function () {
    before(setup());

    if (common.protocol() != "mongodb") {
      it("might add duplicates", function () {
        return Pet.find({ petName: "Mutt" })
          .then(function (pets) {
            return Promise.all([pets, Person.find({ firstName: "Jane" })]);
          })
          .then(function ([pets, people]) {
            return Promise.all([people, people[0].addPetsAsync(pets[0])]);
          })
          .then(function ([people]) {
            return people[0].getPetsAsync("petName");
          })
          .then(function (pets) {
            should(Array.isArray(pets));
            pets.length.should.equal(2);
            pets[0].petName.should.equal("Mutt");
            pets[1].petName.should.equal("Mutt");
          });
      });
    }

    it("should keep associations and add new ones", function () {
      return Pet.find({ petName: "Deco" }).first()
        .then(function (Deco) {
          return Promise.all([Deco, Person.find({ firstName: "Jane" }).first()]);
        })
        .then(function ([Deco, Jane]) {
          return Promise.all([Deco, Jane, Jane.getPetsAsync()]);
        })
        .then(function ([Deco, Jane, janesPets]) {
          var petsAtStart = janesPets.length;
          return Promise.all([petsAtStart, Jane, Jane.addPetsAsync(Deco)]);
        })
        .then(function ([petsAtStart, Jane]) {
          return Promise.all([petsAtStart, Jane.getPetsAsync("petName")]);
        })
        .then(function ([petsAtStart, pets]) {
          should(Array.isArray(pets));
          pets.length.should.equal(petsAtStart + 1);
          pets[0].petName.should.equal("Deco");
          pets[1].petName.should.equal("Mutt");
        });
    });

    it("should accept several arguments as associations", function () {
      return Pet.find()
        .then(function (pets) {
          return Promise.all([pets, Person.find({ firstName: "Justin" }).first()]);
        })
        .then(function ([pets, Justin]) {
          return Promise.all([Justin, Justin.addPetsAsync(pets[0], pets[1])]);
        })
        .then(function ([Justin]) {
          return Justin.getPetsAsync();
        })
        .then(function (pets) {
          should(Array.isArray(pets));
          pets.length.should.equal(2);
        });
    });

    it("should accept array as list of associations", function () {
      return Pet.create([{ petName: 'Ruff' }, { petName: 'Spotty' }])
        .then(function (pets) {
          return Promise.all([pets, Person.find({ firstName: "Justin" }).first()]);
        })
        .then(function ([pets, Justin]) {
          return Promise.all([Justin, pets, Justin.getPetsAsync()]);
        })
        .then(function ([Justin, pets, justinsPets]) {
          var petCount = justinsPets.length;
          return Promise.all([petCount, Justin, Justin.addPetsAsync(pets)]);
        })
        .then(function ([petCount, Justin]) {
          return Promise.all([petCount, Justin.getPetsAsync()]);
        })
        .then(function ([petCount, justinsPets]) {
          should(Array.isArray(justinsPets));
          // Mongo doesn't like adding duplicates here, so we add new ones.
          should.equal(justinsPets.length, petCount + 2);
        });
    });

    it("should throw if no items passed", function () {
      return Person.one()
        .then(function (person) {
          return person.addPetsAsync()
        })
        .catch(function(err) {
          should.exists(err);
        });
    });
  });

  describe("setAccessorAsync", function () {
    before(setup());

    it("should accept several arguments as associations", function () {
      return Pet.find()
        .then(function (pets) {
          return Promise.all([pets, Person.find({ firstName: "Justin" }).first()]);
        })
        .then(function ([pets, Justin]) {
          return Promise.all([Justin, Justin.setPetsAsync(pets[0], pets[1])]);
        })
        .then(function ([Justin]) {
          return Justin.getPetsAsync();
        })
        .then(function (pets) {
          should(Array.isArray(pets));
          pets.length.should.equal(2);
        });
    });

    it("should accept an array of associations", function () {
      return Pet.find()
        .then(function (pets) {
          return Promise.all([pets, Person.find({ firstName: "Justin" }).first()]);
        })
        .then(function ([pets, Justin]) {
          return Promise.all([Justin, pets, Justin.setPetsAsync(pets)]);
        })
        .then(function ([Justin, pets]) {
          return Promise.all([Justin.getPetsAsync(), pets]);
        })
        .then(function ([all_pets, pets]) {
          should(Array.isArray(all_pets));
          all_pets.length.should.equal(pets.length);
        });
    });

    it("should remove all associations if an empty array is passed", function () {
      return Person.find({ firstName: "Justin" }).first()
        .then(function (Justin) {
          return Promise.all([Justin, Justin.getPetsAsync()]);
        })
        .then(function ([Justin, pets]) {
          should.equal(pets.length, 2);

          return Promise.all([Justin, Justin.setPetsAsync([])]);
        })
        .then(function ([Justin]) {
          return Justin.getPetsAsync();
        })
        .then(function (pets) {
          should.equal(pets.length, 0);
        });
    });

    it("clears current associations", function () {
      return Pet.find({ petName: "Deco" })
        .then(function (pets) {
          var Deco = pets[0];

          return Promise.all([Deco, Person.find({ firstName: "Jane" }).first()]);
        })
        .then(function ([Deco, Jane]) {
          return Promise.all([Deco, Jane, Jane.getPetsAsync()]);
        })
        .then(function ([Deco, Jane, pets]) {
          should(Array.isArray(pets));
          pets.length.should.equal(1);
          pets[0].petName.should.equal("Mutt");

          return Promise.all([pets, Jane, Deco, Jane.setPetsAsync(Deco)])
        })
        .then(function ([pets, Jane, Deco]) {
          return Promise.all([Deco, Jane.getPetsAsync()]);
        })
        .then(function ([Deco, pets]) {
          should(Array.isArray(pets));
          pets.length.should.equal(1);
          pets[0].petName.should.equal(Deco.petName);
        });
    });
  });

  describe("with autoFetch turned on (promised-based test)", function () {
    before(setup({
      autoFetchPets : true
    }));

    it("should not auto save associations which were autofetched", function () {
      return Pet.all()
        .then(function (pets) {
          should.equal(pets.length, 2);

          return Promise.all([pets, Person.create({ firstName: 'Paul' })]);
        })
        .then(function ([pets, paul]) {
          return Promise.all([pets, paul, Person.one({ firstName: 'Paul' })]);
        })
        .then(function ([pets, paul, paul2]) {
          should.equal(paul2.pets.length, 0);

          return Promise.all([pets, paul, paul2, paul.setPetsAsync(pets)]);
        })
        .then(function ([pets, paul2]) {

          // reload paul to make sure we have 2 pets
          return Promise.all([pets, Person.one({ firstName: 'Paul' }), paul2]);
        })
        .then(function ([pets, paul, paul2]) {
          should.equal(paul.pets.length, 2);

          // Saving paul2 should NOT auto save associations and hence delete
          // the associations we just created.
          return paul2.save();
        })
        .then(function () {
          // let's check paul - pets should still be associated
          return Person.one({ firstName: 'Paul' });
        })
        .then(function (paul) {
          should.equal(paul.pets.length, 2);
        });
    });
  });
});
