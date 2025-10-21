var should   = require('should');
var helper   = require('../support/spec_helper');
var common   = require('../common');
var protocol = common.protocol();

describe("hasMany", function () {
  var db     = null;
  var Person = null;
  var Pet    = null;

  before(async function() {
    db = await helper.connectAsync();
  });

  after(async function() {
    await db.close();
  });

  describe("normal", function () {

    var setup = function (opts) {
      opts = opts || {};

      return async function () {
        db.settings.set('instance.identityCache', false);

        Person = db.define('person', {
          name    : String,
          surname : String,
          age     : Number
        });
        Pet = db.define('pet', {
          name    : String
        });
        Person.hasMany('pets', Pet, {}, { autoFetch: opts.autoFetchPets });

        await helper.dropSyncAsync([ Person, Pet]);

        await Pet.create([{ name: "Cat" }, { name: "Dog" }]);

        /**
         * John --+---> Deco
         *        '---> Mutt <----- Jane
         *
         * Justin
         */
        const Bob = await Person.create({
          name    : "Bob",
          surname : "Smith",
          age     : 30
        });
        
        const John = await Person.create({
          name    : "John",
          surname : "Doe",
          age     : 20
        });
        
  const Deco = await Pet.create({ name: "Deco" });
  const Mutt = await Pet.create({ name: "Mutt" });
  const result = await John.addPetsAsync(Deco, Mutt);
  const johnPets = await John.getPetsAsync();
        
        const Jane = await Person.create({
          name    : "Jane",
          surname : "Doe",
          age     : 16
        });
        
        const Justin = await Person.create({
          name    : "Justin",
          surname : "Dean",
          age     : 18
        });

        await Jane.addPetsAsync(Mutt);
      };
    };

    describe("getAccessorAsync", function () {
      before(setup());

      it("should allow to specify order as string", function () {
        return Person.find({ name: "John" })
          .then(function (people) {
            return people[0].getPetsAsync("-name");
          })
          .then(function (pets) {
            should(Array.isArray(pets));
            pets.length.should.equal(2);
            pets[0].model().should.equal(Pet);
            pets[0].name.should.equal("Mutt");
            pets[1].name.should.equal("Deco");
          });
      });

      it("should return proper instance model", function(){
        return Person.find({ name: "John" })
          .then(function (people) {
            return people[0].getPetsAsync("-name");
          })
          .then(function (pets) {
            pets[0].model().should.equal(Pet);
          });
      });

      it("should allow to specify order as Array", function () {
        return Person.find({ name: "John" })
          .then(function (people) {
            return people[0].getPetsAsync([ "name", "Z" ]);
          })
          .then(function (pets) {
            should(Array.isArray(pets));
            pets.length.should.equal(2);
            pets[0].name.should.equal("Mutt");
            pets[1].name.should.equal("Deco");
          });
      });

      it("should allow to specify a limit", function () {
        return Person.find({ name: "John" })
          .first()
          .then(function (John) {
            return John.getPetsAsync(1)
            })
          .then(function (pets) {
            should(Array.isArray(pets));
            pets.length.should.equal(1);
          });
      });

      it("should allow to specify conditions", function () {
        return Person.find({ name: "John" }).first()
          .then(function (John) {
            return John.getPetsAsync({ name: "Mutt" });
          })
          .then(function (pets) {
            should(Array.isArray(pets));
            pets.length.should.equal(1);
            pets[0].name.should.equal("Mutt");
          });
      });

      if (common.protocol() == "mongodb") return;

      it("should allow chaining count()", function () {
        return Person.find({})
          .then(function (people) {
            return Promise.all([people[1].getPetsAsync(), people[2].getPetsAsync(), people[3].getPetsAsync()]);
          })
          .then(function ([count1, count2, count3]) {
            should.strictEqual(count1.length, 2);
            should.strictEqual(count2.length, 1);
            should.strictEqual(count3.length, 0);
          });
      });
    });

    describe("hasAccessorAsync", function () {
      before(setup());

      it("should return true if instance has associated item", function () {
        return Pet.find({ name: "Mutt" })
          .then(function (pets) {
            return Promise.all([pets, Person.find({ name: "Jane" }).first()]);
          })
          .then(function ([pets, Jane]) {
            return Jane.hasPetsAsync(pets[0]);
          })
          .then(function (has_pets) {
            has_pets.should.be.true();
          });
      });

      it("should return false if any passed instances are not associated", function () {
        return Pet.find()
          .then(function (pets) {
            return Promise.all([pets, Person.find({ name: "Jane" }).first()]);
          })
          .then(function ([pets, Jane]) {
            return Jane.hasPetsAsync(pets);
          })
          .then(function (has_pets) {
            has_pets.should.be.false();
          });
      });

      if (common.protocol() != "mongodb") {
        it("should return true if join table has duplicate entries", function () {
          return Pet.find({ name: ["Mutt", "Deco"] })
            .then(function (pets) {
              should.equal(pets.length, 2);

              return Promise.all([pets, Person.find({ name: "John" }).first()]);
            })
            .then(function ([pets, John]) {
              return Promise.all([John, pets, John.hasPetsAsync(pets)]);
            })
            .then(function ([John, pets, hasPets]) {
              should.equal(hasPets, true);

              return Promise.all([
                John,
                pets,
                db.driver.execQueryAsync(
                  "INSERT INTO person_pets (person_id, pets_id) VALUES (?,?), (?,?)",
                  [John.id, pets[0].id, John.id, pets[1].id]
                )
              ]);
            })
            .then(function ([John, pets]) {
              return John.hasPetsAsync(pets);
            })
            .then(function (hasPets) {
              should.equal(hasPets, true);
            });
        });

        it("should return true if join table has duplicate entries (promise-based)", function () {
          return Pet.find({ name: ["Mutt", "Deco"] })
            .then(function (pets) {
              should.equal(pets.length, 2);

              return Promise.all([pets, Person.find({ name: "John" }).first()]);
            })
            .then(function ([pets, John]) {
              return Promise.all([ John, pets, John.hasPetsAsync(pets)]);
            })
            .then(function ([John, pets, hasPets]) {
              should.equal(hasPets, true);

              return Promise.all([
                John,
                pets,
                db.driver.execQueryAsync(
                  "INSERT INTO person_pets (person_id, pets_id) VALUES (?,?), (?,?)",
                  [John.id, pets[0].id, John.id, pets[1].id]
                )
              ]);
            })
            .then(function ([John, pets]) {
              return John.hasPetsAsync(pets);
            })
            .then(function (hasPets) {
              should.equal(hasPets, true);
            });
        });
      }
    });

    describe("delAccessorAsync", function () {
      before(setup());

      it("should accept arguments in different orders", function () {
        return Pet.find({ name: "Mutt" })
          .then(function (pets) {
            return Promise.all([pets, Person.find({ name: "John" })]);
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
            pets[0].name.should.equal("Deco");
          });
      });

      it("should remove specific associations if passed", function () {
        return Pet.find({ name: "Mutt" })
          .then(function (pets) {
            return Promise.all([pets, Person.find({ name: "John" })]);
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
            pets[0].name.should.equal("Deco");
          });
      });

      it("should remove all associations if none passed", function () {
        return Person.find({ name: "John" }).first()
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

        it("might add duplicates (promise-based)", function () {
          return Pet.find({ name: "Mutt" })
            .then(function (pets) {
              return Promise.all([pets, Person.find({ name: "Jane" })]);
            })
            .then(function ([pets, people]) {
              return Promise.all([people, people[0].addPetsAsync(pets[0])]);
            })
            .then(function ([people]) {
              return people[0].getPetsAsync("name");
            })
            .then(function (pets) {
              should(Array.isArray(pets));
              pets.length.should.equal(2);
              pets[0].name.should.equal("Mutt");
              pets[1].name.should.equal("Mutt");
            });
        });
      }

      it("should keep associations and add new ones", function () {
        return Pet.find({ name: "Deco" }).first()
          .then(function (Deco) {
            return Promise.all([Deco, Person.find({ name: "Jane" }).first()]);
          })
          .then(function ([Deco, Jane]) {
            return Promise.all([Jane, Deco, Jane.getPetsAsync()])
          })
          .then(function ([Jane, Deco, janesPets]) {
            var petsAtStart = janesPets.length;

            return Promise.all([petsAtStart, Jane, Jane.addPetsAsync(Deco)]);
          })
          .then(function ([petsAtStart, Jane]) {
            return Promise.all([petsAtStart, Jane.getPetsAsync("name")]);
          })
          .then(function ([petsAtStart, pets]) {
            should(Array.isArray(pets));
            pets.length.should.equal(petsAtStart + 1);
            pets[0].name.should.equal("Deco");
            pets[1].name.should.equal("Mutt");
          });
      });

      it("should accept several arguments as associations (promise-based)", function () {
        return Pet.find()
          .then(function (pets) {
            return Promise.all([pets, Person.find({ name: "Justin" }).first()]);
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

      it("should accept array as list of associations (promise-based)", function () {
        return Pet.create([{ name: 'Ruff' }, { name: 'Spotty' }])
          .then(function (pets) {
            return Promise.all([pets, Person.find({ name: "Justin" }).first()]);
          })
          .then(function ([pets, Justin]) {
            return Promise.all([pets, Justin, Justin.getPetsAsync()]);
          })
          .then(function ([pets, Justin, justinsPets]) {
            var petCount = justinsPets.length;

            return Promise.all([Justin, petCount, Justin.addPetsAsync(pets)]);
          })
          .then(function ([Justin, petCount]) {
            return Promise.all([petCount, Justin.getPetsAsync()]);
          })
          .then(function ([petCount, justinsPets]) {
            should(Array.isArray(justinsPets));
            // Mongo doesn't like adding duplicates here, so we add new ones.
            should.equal(justinsPets.length, petCount + 2);
          });
      });
    });

    describe("setAccessorAsync", function () {
      before(setup());

      it("should accept several arguments as associations", function () {
        return Pet.find()
          .then(function (pets) {
            return Promise.all([pets, Person.find({ name: "Justin" }).first()]);
          })
          .then(function ([pets, Justin]) {
            return Promise.all([Justin, Justin.setPetsAsync(pets[0], pets[1])])
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
            return Promise.all([pets, Person.find({ name: "Justin" }).first()]);
          })
          .then(function ([pets, Justin]) {
            return Promise.all([pets, Justin, Justin.setPetsAsync(pets)]);
          })
          .then(function ([pets, Justin]) {
            return Promise.all([pets, Justin.getPetsAsync()]);
          })
          .then(function ([pets, all_pets]) {
            should(Array.isArray(all_pets));
            all_pets.length.should.equal(pets.length);
          });
      });

      it("should remove all associations if an empty array is passed", function () {
        return Person.find({ name: "Justin" }).first()
          .then(function (Justin) {
            return Promise.all([Justin, Justin.getPetsAsync()]);
          })
          .then(function ([Justin, pets]) {
            should.equal(pets.length, 4);

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
        return Pet.find({ name: "Deco" })
          .then(function (pets) {
            var Deco = pets[0];

            return Promise.all([Deco, Person.find({ name: "Jane" }).first()]);
          })
          .then(function ([Deco, Jane]) {
            return Promise.all([Jane, Deco, Jane.getPetsAsync()]);
          })
          .then(function ([Jane, Deco, pets]) {
            should(Array.isArray(pets));
            pets.length.should.equal(1);
            pets[0].name.should.equal("Mutt");

            return Promise.all([Jane, Deco, Jane.setPetsAsync(Deco)]);
          })
          .then(function ([Jane, Deco]) {
            return Promise.all([Deco, Jane.getPetsAsync()]);
          })
          .then(function ([Deco, pets]) {
            should(Array.isArray(pets));
            pets.length.should.equal(1);
            pets[0].name.should.equal(Deco.name);
          });
      });
    });

    describe("with autoFetch turned on", function () {
      before(setup({
        autoFetchPets : true
      }));

      it("should fetch associations", function () {
        return Person.find({ name: "John" }).first()
          .then(function (John) {
            John.should.have.property("pets");
            should(Array.isArray(John.pets));
            John.pets.length.should.equal(2);
          });
      });

      it("should save existing", function () {
        return Person.create({ name: 'Bishan' })
          .then(function () {
            return Person.one({ name: 'Bishan' });
          })
          .then(function (person) {
            person.surname = 'Dominar';

            return person.save();
          })
          .then(function (person) {
            should.equal(person.surname, 'Dominar');
          });
      });

      it("should not auto save associations which were autofetched", function () {
        return Pet.all()
          .then(function (pets) {
            should.equal(pets.length, 4);

            return Promise.all([pets, Person.create({ name: 'Paul' })]);
          })
          .then(function ([pets]) {
            return Promise.all([pets, Person.one({ name: 'Paul' })]);
          })
          .then(function ([pets, paul]) {
            should.equal(paul.pets.length, 0);

            return paul.setPetsAsync(pets);
          })
          .then(function () {
            // reload paul to make sure we have 2 pets
            return Person.one({ name: 'Paul' });
          })
          .then(function (paul) {
            should.equal(paul.pets.length, 4);

            // Saving paul2 should NOT auto save associations and hence delete
            // the associations we just created.
            return paul.save();
          })
          .then(function () {
            // let's check paul - pets should still be associated
            return Person.one({ name: 'Paul' });
          })
          .then(function (paul) {
            should.equal(paul.pets.length, 4);
          });
      });

      it("should save associations set by the user", function () {
        return Person.one({ name: 'John' })
          .then(function (john) {
            should.equal(john.pets.length, 2);

            john.pets = [];

            return john.save();
          })
          .then(function () {
            // reload john to make sure pets were deleted
            return Person.one({ name: 'John' });
          })
          .then(function (john) {
            should.equal(john.pets.length, 0);
          });
      });

    });
  });

  if (protocol == "mongodb") return;

});
