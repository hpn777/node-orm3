var should   = require('should');
var helper   = require('../support/spec_helper');
var ORM      = require('../../');
var Settings = ORM.Settings;

describe("Settings", function () {
  describe("changed on connection instance", function() {
    it("should not change global defaults", async function() {
      var setting = 'instance.returnAllErrors';
      var defaultValue = ORM.settings.get(setting);

      const db1 = await new Promise(resolve => helper.connect(resolve));
      db1.settings.set(setting, !defaultValue);
      await db1.close();

      const db2 = await new Promise(resolve => helper.connect(resolve));
      db2.settings.get(setting).should.equal(defaultValue);
      await db2.close();
    });
  });

  describe("#get", function () {
    var settings, returned;

    beforeEach(function () {
      settings = new Settings.Container({ a: [1,2] });
      returned = null;
    });

    it("should clone everything it returns", function () {
      returned = settings.get('*');
      returned.a = 123;

      settings.get('a').should.eql([1,2]);
    });

    it("should deep clone everything it returns", function () {
      returned = settings.get('*');
      returned.a.push(3);

      settings.get('a').should.eql([1,2]);
    });
  });

  describe("manipulating:", function () {
    var testFunction = function testFunction() {
      return "test";
    };
    var settings = new Settings.Container({});

    describe("some.sub.object = 123.45", function () {
      before(function () {
        settings.set("some.sub.object", 123.45);
      });

      it("should be 123.45", function () {
        settings.get("some.sub.object").should.equal(123.45);
      });
    });

    describe("some....object = testFunction", function () {
      before(function () {
        settings.set("some....object", testFunction);
      });

      it("should be testFunction", function () {
        settings.get("some....object").should.equal(testFunction);
      });
    });

    describe("not setting some.unknown.object", function () {
      it("should be undefined", function () {
        should.equal(settings.get("some.unknown.object"), undefined);
      });
    });

    describe("unsetting some.sub.object", function () {
      before(function () {
        settings.unset("some.sub.object");
      });

      it("should be undefined", function () {
        should.equal(settings.get("some.sub.object"), undefined);
      });
    });

    describe("unsetting some....object", function () {
      before(function () {
        settings.unset("some....object");
      });

      it("should be undefined", function () {
        should.equal(settings.get("some....object"), undefined);
      });
    });

    describe("unsetting some.*", function () {
      before(function () {
        settings.unset("some.*");
      });

      it("should return undefined for any 'some' sub-element", function () {
        should.equal(settings.get("some.other.stuff"), undefined);
      });
      it("should return an empty object for some.*", function () {
        settings.get("some.*").should.be.a.Object();
        Object.keys(settings.get("some.*")).should.have.lengthOf(0);
      });
      it("should return an empty object for some", function () {
        settings.get("some").should.be.a.Object();
        Object.keys(settings.get("some")).should.have.lengthOf(0);
      });
    });
  });
});
