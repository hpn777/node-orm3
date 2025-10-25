var should   = require('should');
var helper   = require('../support/spec_helper');
var ORM      = require('../../');

describe("LazyLoad properties", function() {
  var db = null;
  var Person = null;
  var PersonPhoto = Buffer.alloc(1024); // fake photo
  var OtherPersonPhoto = Buffer.alloc(1024); // other fake photo

  function normalizeToBuffer(value) {
    if (value == null) return value;

    if (Buffer.isBuffer(value)) {
      return value;
    }

    if (typeof value === 'string') {
      try {
        var parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return Buffer.from(Object.keys(parsed).sort(function (a, b) {
            return parseInt(a, 10) - parseInt(b, 10);
          }).map(function (key) {
            return parsed[key];
          }));
        }
      } catch (err) {
        return Buffer.from(value);
      }
    }

    if (Array.isArray(value)) {
      return Buffer.from(value);
    }

    if (typeof value === 'object') {
      return Buffer.from(Object.keys(value).sort(function (a, b) {
        return parseInt(a, 10) - parseInt(b, 10);
      }).map(function (key) {
        return value[key];
      }));
    }

    return Buffer.from(String(value));
  }

  var setup = function () {
    return async function () {
      Person = db.define("person", {
        name   : String,
        photo  : { type: "binary", lazyload: true }
      });

      ORM.singleton.clear();

      await helper.dropSync(Person);
      await Person.create({
        name  : "John Doe",
        photo : PersonPhoto
      });
    };
  };

  before(async function () {
    db = await helper.connect();
  });

  after(async function () {
    await db.close();
  });

  describe("when defined lazyload methods", function () {
    before(setup());

    it("should not be available when fetching an instance", async function () {
      var persons = await Person.find().run();
      var john = persons[0];

      should.equal(typeof john, 'object');
      should.equal(Array.isArray(john), false);
      john.should.have.property("name", "John Doe");
      john.should.have.property("photo", null);
    });

    it("should have appropriate accessors", async function () {
      var persons = await Person.find().run();
      var John = persons[0];

      should.equal(typeof John, 'object');
      should.equal(Array.isArray(John), false);

      John.getPhoto.should.be.a.Function();
      John.setPhoto.should.be.a.Function();
      John.removePhoto.should.be.a.Function();
    });

    it("get accessor should return property", async function () {
      var persons = await Person.find().run();
      var John = persons[0];

      should.equal(typeof John, 'object');
      should.equal(Array.isArray(John), false);

      var photo = await John.getPhoto();
      var photoBuffer = normalizeToBuffer(photo);
      Buffer.compare(photoBuffer, PersonPhoto).should.equal(0);
    });

    it("set accessor should change property", async function () {
      var persons = await Person.find().run();
      var John = persons[0];
      should.equal(typeof John, 'object');

      await John.setPhoto(OtherPersonPhoto);

      persons = await Person.find().run();
      John = persons[0];

      should.equal(typeof John, 'object');
      should.equal(Array.isArray(John), false);

      var photo = await John.getPhoto();
      var photoBuffer = normalizeToBuffer(photo);
      Buffer.compare(photoBuffer, OtherPersonPhoto).should.equal(0);
    });

    it("remove accessor should change property", async function () {
      var persons = await Person.find().run();
      var John = persons[0];

      should.equal(typeof John, 'object');
      should.equal(Array.isArray(John), false);

      await John.removePhoto();

      John = await Person.get(John[Person.id]);
      should.equal(typeof John, 'object');
      should.equal(Array.isArray(John), false);

      var photo = await John.getPhoto();
      should.equal(photo, null);
    });
  });
});
