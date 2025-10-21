var should   = require('should');
var helper   = require('../support/spec_helper');
var ORM      = require('../../');
var common   = require('../common');

describe("Model.find() chaining - Async API", function() {
  var db = null;
  var Person = null;
  var Dog = null;

  var setup = function (extraOpts) {
    extraOpts = extraOpts || {};

    return async function () {
      Person = db.define("person", {
        name    : String,
        surname : String,
        age     : Number
      }, extraOpts);
      Person.hasMany("parents");
      Person.hasOne("friend");

      ORM.singleton.clear();

      await helper.dropSyncAsync(Person);
      await Person.create([
        {
          name      : "John",
          surname   : "Doe",
          age       : 18,
          friend_id : 1
        },
        {
          name      : "Jane",
          surname   : "Doe",
          age       : 20,
          friend_id : 1
        },
        {
          name      : "Jane",
          surname   : "Dean",
          age       : 18,
          friend_id : 1
        }
      ]);
    };
  };

  var setup2 = function () {
    return async function () {
      Dog = db.define("dog", {
        name: String
      });
      Dog.hasMany("friends");
      Dog.hasMany("family");

      ORM.singleton.clear();

      await helper.dropSyncAsync(Dog);

      const fido = await Dog.create({ name: "Fido" });
      const thumper = await Dog.create({ name: "Thumper" });

      const gunner = await Dog.create({ name: "Gunner" });
      const chainsaw = await Dog.create({ name: "Chainsaw" });
      const chester = await Dog.create({ name: "Chester" });
      const bambi = await Dog.create({ name: "Bambi" });
      const princess = await Dog.create({ name: "Princess" });
      const butch = await Dog.create({ name: "Butch" });

      await fido.addFriends([gunner, chainsaw]);
      await fido.addFamily([chester]);

      await thumper.addFriends([bambi]);
      await thumper.addFamily([princess, butch]);
    };
  };

  before(async function () {
    db = await helper.connectAsync();
  });

  after(function () {
    return db.close();
  });

  describe(".limit(N)", function () {
    before(setup());

    it("should limit results to N items", async function () {
      var people = await Person.find().limit(2);
      should(Array.isArray(people));
      people.should.have.property("length", 2);
    });

    it("should support callback form", async function () {
      await new Promise(function (resolve, reject) {
        Person.find().limit(2).run(function (err, people) {
          if (err) return reject(err);
          people.should.have.property("length", 2);
          return resolve();
        });
      });
    });
  });

  describe(".skip(N)", function () {
    before(setup());

    it("should skip the first N results", async function () {
      var people = await Person.find().skip(2).order("age");
      people.should.have.property("length", 1);
      people[0].age.should.equal(20);
    });
  });

  describe(".offset(N)", function () {
    before(setup());

    it("should skip the first N results", async function () {
      var people = await Person.find().offset(2).order("age");
      people.should.have.property("length", 1);
      people[0].age.should.equal(20);
    });
  });

  describe("order", function () {
    before(setup());

    it("('property') should order ascending", async function () {
      var people = await Person.find().order("age");
      people.should.have.property("length", 3);
      people[0].age.should.equal(18);
      people[2].age.should.equal(20);
    });

    it("('-property') should order descending", async function () {
      var people = await Person.find().order("-age");
      people.should.have.property("length", 3);
      people[0].age.should.equal(20);
      people[2].age.should.equal(18);
    });

    it("('property', 'Z') should order descending", async function () {
      var people = await Person.find().order("age", "Z");
      people.should.have.property("length", 3);
      people[0].age.should.equal(20);
      people[2].age.should.equal(18);
    });
  });

  describe("orderRaw", function () {
    before(setup());

    it("should allow ordering by SQL", async function () {
      var people = await Person.find().orderRaw("age DESC");
      people.should.have.property("length", 3);
      people[0].age.should.equal(20);
      people[2].age.should.equal(18);
    });

    it("should allow ordering by SQL with args", async function () {
      var people = await Person.find().orderRaw("?? DESC", ['age']);
      people.should.have.property("length", 3);
      people[0].age.should.equal(20);
      people[2].age.should.equal(18);
    });
  });

  describe("only", function () {
    before(setup());

    it("should only load the requested properties", async function () {
      var people = await Person.find().only("age", "surname").order("-age");
      people.should.have.property("length", 3);
      should.exist(people[0].age);
      people[0].should.have.property("surname", "Doe");
      should(people[0].name).be.null();
    });

    it("should accept arrays", async function () {
      var people = await Person.find().only(["age", "surname"]).order("-age");
      people.should.have.property("length", 3);
      should.exist(people[0].age);
      people[0].should.have.property("surname", "Doe");
      should(people[0].name).be.null();
    });
  });

  describe("omit", function () {
    before(setup());

    it("should omit the requested properties", async function () {
      var people = await Person.find().omit("age", "surname").order("-age");
      people.should.have.property("length", 3);
      should.exist(people[0].id);
      should.exist(people[0].friend_id);
      should(people[0].age).be.null();
      should(people[0].surname).be.null();
      people[0].should.have.property("name", "Jane");
    });

    it("should accept arrays", async function () {
      var people = await Person.find().omit(["age", "surname"]).order("-age");
      people.should.have.property("length", 3);
      should(people[0].age).be.null();
      should(people[0].surname).be.null();
      people[0].should.have.property("name", "Jane");
    });
  });

  describe("count", function () {
    before(setup());

    it("should return total number of results", async function () {
      var count = await Person.find().count();
      count.should.equal(3);
    });

    it("should support callback form", async function () {
      await new Promise(function (resolve, reject) {
        Person.find({ surname: "Doe" }).count(function (err, count) {
          if (err) return reject(err);
          count.should.equal(2);
          return resolve();
        });
      });
    });
  });

  describe("first/last", function () {
    before(setup());

    it("should return the first item", async function () {
      var item = await Person.find().order("age").first();
      should.exist(item);
      item.age.should.equal(18);
    });

    it("should return the last item via callback", async function () {
      await new Promise(function (resolve, reject) {
        Person.find().order("age").last(function (err, item) {
          if (err) return reject(err);
          should.exist(item);
          item.age.should.equal(20);
          return resolve();
        });
      });
    });

    it("should return null when nothing found", async function () {
      var item = await Person.find({ name: "Nobody" }).first();
      should.equal(item, null);
    });
  });

  describe("find chaining", function () {
    before(setup());

    it("should chain conditions", async function () {
      var count = await Person.find().find({ age: 18 }).find({ name: "Jane" }).count();
      count.should.equal(1);
    });

    it("should allow callback as second argument", async function () {
      await new Promise(function (resolve, reject) {
        Person.find().find({ age: 18 }, function (err, people) {
          if (err) return reject(err);
          people.should.have.property("length", 2);
          return resolve();
        });
      });
    });

    it("should append raw sql conditions", async function () {
      var people = await Person.find().find("LOWER(surname) LIKE ?", ['dea%']);
      people.should.have.property("length", 1);
      people[0].surname.toLowerCase().should.equal("dean");
    });

    it("should transparently alias all() and where()", async function () {
      var people = await Person.find().where({ surname: "Doe" });
      people.should.have.property("length", 2);
    });
  });

  describe("finder interchangeability", function () {
    before(setup());

    before(async function () {
      await Person.create([
        { name: "Mel", surname: "Gabbs", age: 12 },
        { name: "Mel", surname: "Gibbs", age: 22 },
        { name: "Mel", surname: "Gobbs", age: 32 }
      ]);
    });

    ['find', 'where', 'all'].forEach(function (func) {
      it('.' + func + '()', async function () {
        var items = await new Promise(function (resolve, reject) {
          Person[func]({ name: "Mel" })[func]({ age: ORM.gt(20) })[func](function (err, results) {
            if (err) return reject(err);
            resolve(results);
          });
        });

        should.equal(items.length, 2);
        items[0].surname.should.equal("Gibbs");
        items[1].surname.should.equal("Gobbs");
      });
    });

    it("should allow mixing finders", async function () {
      var items = await new Promise(function (resolve, reject) {
        Person.all({ name: "Mel" }).where({ age: ORM.gt(20) }).find(function (err, results) {
          if (err) return reject(err);
          resolve(results);
        });
      });

      should.equal(items.length, 2);
      items[0].surname.should.equal("Gibbs");
      items[1].surname.should.equal("Gobbs");
    });
  });

  describe("remove", function () {
    before(setup());

    it("should remove matching items", async function () {
      await Person.find({ age: 20 }).remove();
      var count = await Person.find().count();
      count.should.equal(2);
    });
  });

  describe("each chain", function () {
    before(setup({ hooks: {
      beforeRemove: function () {}
    }}));

    it("should expose chain instance helpers", function () {
      var chain = Person.find().each();
      chain.should.be.an.Object();
      chain.filter.should.be.a.Function();
      chain.sort.should.be.a.Function();
      chain.count.should.be.a.Function();
      chain.get.should.be.a.Function();
      chain.save.should.be.a.Function();
    });

    it("should filter and count results", async function () {
      await new Promise(function (resolve) {
        Person.find().each().filter(function (person) {
          return person.age > 18;
        }).count(function (count) {
          count.should.equal(1);
          resolve();
        });
      });
    });

    it("should sort results", async function () {
      await new Promise(function (resolve) {
        Person.find().each().sort(function (a, b) {
          return b.age - a.age;
        }).get(function (people) {
          people.should.be.an.Array();
          people.length.should.equal(3);
          people[0].age.should.equal(20);
          people[2].age.should.equal(18);
          resolve();
        });
      });
    });

    it("should save modified results", async function () {
      await new Promise(function (resolve, reject) {
        Person.find({ surname: "Dean" }).each(function (person) {
          person.age = 45;
        }).save(function (err) {
          if (err) return reject(err);
          Person.find({ surname: "Dean" }).first(function (err2, person) {
            if (err2) return reject(err2);
            person.age.should.equal(45);
            resolve();
          });
        });
      });
    });
  });

  describe("association helpers", function () {
    before(setup());

    it("should support hasAccessor chains", async function () {
      var john = (await Person.find({ name: "John" }))[0];
      var justin = new Person({ name: "Justin", age: 45 });

      await new Promise(function (resolve, reject) {
        john.setParents([justin], function (err) {
          if (err) return reject(err);
          resolve();
        });
      });

      var people = await Person.find().hasParents(justin);
      people.should.have.property("length", 1);
      people[0].name.should.equal("John");
    });
  });

  describe("eager loading", function () {
    before(setup2());

    it("should fetch listed associations in a single query", async function () {
      var dogs = await Dog.find({ name: ["Fido", "Thumper"] }).eager("friends");
      dogs.should.be.an.Array();
      dogs.should.have.property("length", 2);
      dogs[0].friends.should.have.property("length", 2);
      dogs[1].friends.should.have.property("length", 1);
    });

    it("should support multiple associations", async function () {
      var dogs = await Dog.find({ name: ["Fido", "Thumper"] }).eager("friends", "family");
      dogs.should.have.property("length", 2);
      dogs[0].friends.should.have.property("length", 2);
      dogs[0].family.should.have.property("length", 1);
      dogs[1].friends.should.have.property("length", 1);
      dogs[1].family.should.have.property("length", 2);
    });

    it("should accept array parameters", async function () {
      var dogs = await Dog.find({ name: ["Fido", "Thumper"] }).eager(["friends", "family"]);
      dogs.should.have.property("length", 2);
      dogs[0].friends.should.have.property("length", 2);
      dogs[0].family.should.have.property("length", 1);
      dogs[1].friends.should.have.property("length", 1);
      dogs[1].family.should.have.property("length", 2);
    });
  });
});
