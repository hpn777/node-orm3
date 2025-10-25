var should   = require('should');
var helper   = require('../support/spec_helper');
var common   = require('../common');
var protocol = common.protocol();

describe("hasMany", function () {
  var db     = null;
  var Person = null;
  var Pet    = null;

  before(async function() {
  db = await helper.connect();
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

  await helper.dropSync([ Person, Pet]);

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
  const result = await John.addPets(Deco, Mutt);
  const johnPets = await John.getPets();
        
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

  await Jane.addPets(Mutt);
      };
    };

  describe("getAccessor", function () {
      before(setup());

      it("should allow to specify order as string", function () {
        return Person.find({ name: "John" })
          .then(function (people) {
            return people[0].getPets("-name");
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
            return people[0].getPets("-name");
          })
          .then(function (pets) {
            pets[0].model().should.equal(Pet);
          });
      });

      it("should allow to specify order as Array", function () {
        return Person.find({ name: "John" })
          .then(function (people) {
            return people[0].getPets([ "name", "Z" ]);
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
            return John.getPets(1)
            })
          .then(function (pets) {
            should(Array.isArray(pets));
            pets.length.should.equal(1);
          });
      });

      it("should allow to specify conditions", function () {
        return Person.find({ name: "John" }).first()
          .then(function (John) {
            return John.getPets({ name: "Mutt" });
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
            return Promise.all([people[1].getPets(), people[2].getPets(), people[3].getPets()]);
          })
          .then(function ([count1, count2, count3]) {
            should.strictEqual(count1.length, 2);
            should.strictEqual(count2.length, 1);
            should.strictEqual(count3.length, 0);
          });
      });
    });

  describe("hasAccessor", function () {
      before(setup());

      it("should return true if instance has associated item", function () {
        return Pet.find({ name: "Mutt" })
          .then(function (pets) {
            return Promise.all([pets, Person.find({ name: "Jane" }).first()]);
          })
          .then(function ([pets, Jane]) {
            return Jane.hasPets(pets[0]);
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
            return Jane.hasPets(pets);
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
              return Promise.all([John, pets, John.hasPets(pets)]);
            })
            .then(function ([John, pets, hasPets]) {
              should.equal(hasPets, true);

              return Promise.all([
                John,
                pets,
                new Promise(function (resolve, reject) {
                  db.driver.execQuery(
                    "INSERT INTO person_pets (person_id, pets_id) VALUES (?,?), (?,?)",
                    [John.id, pets[0].id, John.id, pets[1].id],
                    function (err) {
                      if (err) return reject(err);
                      resolve();
                    }
                  );
                })
              ]);
            })
            .then(function ([John, pets]) {
              return John.hasPets(pets);
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
              return Promise.all([ John, pets, John.hasPets(pets)]);
            })
            .then(function ([John, pets, hasPets]) {
              should.equal(hasPets, true);

              return Promise.all([
                John,
                pets,
                new Promise(function (resolve, reject) {
                  db.driver.execQuery(
                    "INSERT INTO person_pets (person_id, pets_id) VALUES (?,?), (?,?)",
                    [John.id, pets[0].id, John.id, pets[1].id],
                    function (err) {
                      if (err) return reject(err);
                      resolve();
                    }
                  );
                })
              ]);
            })
            .then(function ([John, pets]) {
              return John.hasPets(pets);
            })
            .then(function (hasPets) {
              should.equal(hasPets, true);
            });
        });
      }
    });

    describe("delAccessor", function () {
      before(setup());

      it("should accept arguments in different orders", function () {
        return Pet.find({ name: "Mutt" })
          .then(function (pets) {
            return Promise.all([pets, Person.find({ name: "John" })]);
          })
          .then(function ([pets, people]) {
            return Promise.all([people, people[0].removePets(pets[0])]);
          })
          .then(function ([people]) {
            return people[0].getPets();
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
            return Promise.all([people, people[0].removePets(pets[0])]);
          })
          .then(function ([people]) {
            return people[0].getPets();
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
            return Promise.all([John, John.removePets()]);
          })
          .then(function ([John]) {
            return John.getPets();
          })
          .then(function (pets) {
            should(Array.isArray(pets));
            pets.length.should.equal(0);
          });
      });
    });

    describe("addAccessor", function () {
      before(setup());

      if (common.protocol() != "mongodb") {

        it("might add duplicates (promise-based)", function () {
          return Pet.find({ name: "Mutt" })
            .then(function (pets) {
              return Promise.all([pets, Person.find({ name: "Jane" })]);
            })
            .then(function ([pets, people]) {
              return Promise.all([people, people[0].addPets(pets[0])]);
            })
            .then(function ([people]) {
              return people[0].getPets("name");
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
            return Promise.all([Jane, Deco, Jane.getPets()])
          })
          .then(function ([Jane, Deco, janesPets]) {
            var petsAtStart = janesPets.length;

            return Promise.all([petsAtStart, Jane, Jane.addPets(Deco)]);
          })
          .then(function ([petsAtStart, Jane]) {
            return Promise.all([petsAtStart, Jane.getPets("name")]);
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
            return Promise.all([Justin, Justin.addPets(pets[0], pets[1])]);
          })
          .then(function ([Justin]) {
            return Justin.getPets();
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
            return Promise.all([pets, Justin, Justin.getPets()]);
          })
          .then(function ([pets, Justin, justinsPets]) {
            var petCount = justinsPets.length;

            return Promise.all([Justin, petCount, Justin.addPets(pets)]);
          })
          .then(function ([Justin, petCount]) {
            return Promise.all([petCount, Justin.getPets()]);
          })
          .then(function ([petCount, justinsPets]) {
            should(Array.isArray(justinsPets));
            // Mongo doesn't like adding duplicates here, so we add new ones.
            should.equal(justinsPets.length, petCount + 2);
          });
      });
    });

    describe("setAccessor", function () {
      before(setup());

      it("should accept several arguments as associations", function () {
        return Pet.find()
          .then(function (pets) {
            return Promise.all([pets, Person.find({ name: "Justin" }).first()]);
          })
          .then(function ([pets, Justin]) {
            return Promise.all([Justin, Justin.setPets(pets[0], pets[1])])
          })
          .then(function ([Justin]) {
            return Justin.getPets();
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
            return Promise.all([pets, Justin, Justin.setPets(pets)]);
          })
          .then(function ([pets, Justin]) {
            return Promise.all([pets, Justin.getPets()]);
          })
          .then(function ([pets, all_pets]) {
            should(Array.isArray(all_pets));
            all_pets.length.should.equal(pets.length);
          });
      });

      it("should remove all associations if an empty array is passed", function () {
        return Person.find({ name: "Justin" }).first()
          .then(function (Justin) {
            return Promise.all([Justin, Justin.getPets()]);
          })
          .then(function ([Justin, pets]) {
            should.equal(pets.length, 4);

            return Promise.all([Justin, Justin.setPets([])]);
          })
          .then(function ([Justin]) {
            return Justin.getPets();
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
            return Promise.all([Jane, Deco, Jane.getPets()]);
          })
          .then(function ([Jane, Deco, pets]) {
            should(Array.isArray(pets));
            pets.length.should.equal(1);
            pets[0].name.should.equal("Mutt");

            return Promise.all([Jane, Deco, Jane.setPets(Deco)]);
          })
          .then(function ([Jane, Deco]) {
            return Promise.all([Deco, Jane.getPets()]);
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

            return paul.setPets(pets);
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
