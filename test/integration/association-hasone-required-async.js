var ORM    = require('../../');
var helper = require('../support/spec_helper');
var should = require('should');
var _      = require('lodash');

describe("hasOne Async", function() {
  var db     = null;
  var Person = null;

  var setup = function (required) {
    return async function () {
      db.settings.set('instance.identityCache', false);
      db.settings.set('instance.returnAllErrors', true);

      Person = db.define('person', {
        name     : String
      });
      Person.hasOne('parent', Person, {
        required : required,
        field    : 'parentId'
      });

  await helper.dropSync(Person);
    };
  };

  before(async function() {
  db = await helper.connect();
  });

  describe("required", function () {
    before(setup(true));

    it("should not accept empty association", async function () {
      var John = new Person({
        name     : "John",
        parentId : null
      });

      try {
        await John.save();
        should.fail('Expected validation error');
      } catch (err) {
        should.exist(err);
        var errors = Array.isArray(err) ? err : [err];
        should.equal(errors.length, 1);
        should.equal(errors[0].type,     'validation');
        should.equal(errors[0].msg,      'required');
        should.equal(errors[0].property, 'parentId');
      }
    });

    it("should accept association", function () {
      var John = new Person({
        name     : "John",
        parentId : 1
      });
      return John.save();
    });
  });

  describe("not required", function () {
    before(setup(false));

    it("should accept empty association", function () {
      var John = new Person({
        name : "John"
      });
      return John.save();
    });

    it("should accept null association", function () {
      var John = new Person({
        name      : "John",
        parent_id : null
      });
      return John.save();
    });
  });
});