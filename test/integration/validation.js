var _        = require('lodash');
var should   = require('should');
var helper   = require('../support/spec_helper');
var async    = require('async');
var common   = require('../common');
var protocol = common.protocol().toLowerCase();
var ORM      = require('../../');

describe("Validations", function() {
  var db = null;
  var Person = null;
  var Person2 = null;

  var setup = function (returnAll, required) {
    return async function () {
      db.settings.set('properties.required',      required);
      db.settings.set('instance.returnAllErrors', returnAll);

      Person = db.define("person", {
        name:   { type: 'text'   },
        height: { type: 'number' },
      }, {
        validations: {
          name:   ORM.validators.rangeLength(3, 30),
          height: ORM.validators.rangeNumber(0.1, 3.0)
        }
      });

      return await helper.dropSyncAsync(Person);
    };
  };

  notNull = function(val, next, data) {
    if (val != null) {
      return next('notnull');
    }
    return next();
  };
  var setupAlwaysValidate = function () {
    return async function () {
      Person2 = db.define("person2", {
        name:   { type: 'text'   },
        mustbenull: { type: 'text', required:false, alwaysValidate: true }
        , canbenull: { type: 'text', required:false }
      }, {
        validations: {
          name:   ORM.validators.rangeLength(3, 30),
          mustbenull: notNull,
          canbenull: notNull
        }
      });
      return await helper.dropSyncAsync(Person2);
    };
  };

  before(async function () {
    db = await helper.connectAsync();
  });

  after(async function () {
    await db.close();
  });


  describe("alwaysValidate", function () {
    before(setupAlwaysValidate());

    it("I want to see it fail first (the absence of evidence)", async function() {
      var rachel = new Person2({name: 'rachel', canbenull:null, mustbenull:null});
      await rachel.save();
    });

    it("then it should work", async function() {
      var tom = new Person2({name: 'tom', canbenull:null, mustbenull:'notnull'});
      const err = await tom.save().catch(e => e);
      should.exist(err);
      should.equal(typeof err,   "object");
      should.equal(err.property, "mustbenull");
      should.equal(err.msg,      "notnull");
      should.equal(err.type,     "validation");
      should.equal(tom.id,      null);
    });
  });

  describe("predefined", function () {
    before(setup(false, false));

    it("should work", async function() {
      var john = new Person({name: 'fdhdjendfjkdfhshdfhakdfjajhfdjhbfgk'});

      const err = await john.save().catch(e => e);
      should.equal(typeof err,   "object");
      should.equal(err.property, "name");
      should.equal(err.value,    "fdhdjendfjkdfhshdfhakdfjajhfdjhbfgk");
      should.equal(err.msg,      "out-of-range-length");
      should.equal(err.type,     "validation");
      should.equal(john.id,      null);
    });

    describe("unique", function () {
      if (protocol === "mongodb") return;

      var Product = null, Supplier = null;

      var setupUnique = function (ignoreCase, scope, msg) {
        return async function () {
          Supplier = db.define("supplier", {
            name     : String
                    }, {
            cache: false
          });
          await helper.dropSyncAsync(Supplier);

          Product = db.define("productUnique", {
            instock  : { type: 'boolean', required: true, defaultValue: false },
            name     : String,
            category : String
          }, {
            cache: false,
            validations: {
              name      : ORM.validators.unique({ ignoreCase: ignoreCase, scope: scope }, msg),
              instock   : ORM.validators.required(),
              productId : ORM.validators.unique() // this must be straight after a required & validated row.
            }
          });
          Product.hasOne('supplier',  Supplier,  { field: 'supplierId' });

          return await helper.dropSyncAsync(Product);
        };
      };

      describe("simple", function () {
        before(setupUnique(false, false));

        it("should return validation error for duplicate name", async function () {
          await Product.create({name: 'fork'});

          const err = await Product.create({name: 'fork'}).catch(e => e);
          should.exist(err);
        });

        it("should pass with different names", async function () {
          await Product.create({name: 'spatula'});
          await Product.create({name: 'plate'});
        });

        // Technically this is covered by the tests above, but I'm putting it here for clarity's sake. 3 HOURS WASTED *sigh.
        it("should not leak required state from previous validation for association properties [regression test]", async function () {
          await Product.create({ name: 'pencil', productId: null});
          await Product.create({ name: 'pencilcase', productId: null });
        });
      });

      describe("scope", function () {
        describe("to other property", function () {

          before(setupUnique(true, ['category']));

          it("should return validation error if other property also matches", async function() {
            await Product.create({name: 'red', category: 'chair'});

            const err = await Product.create({name: 'red', category: 'chair'}).catch(e => e);
            should.exist(err);
            should.equal(err.msg, 'not-unique');
          });

          it("should pass if other property is different", async function () {
            await Product.create({name: 'blue', category: 'chair'});
            await Product.create({name: 'blue', category: 'pen'});
          });

          // In SQL unique index land, NULL values are not considered equal.
          it("should pass if other property is null", async function () {
            await Product.create({name: 'blue', category: null});
            await Product.create({name: 'blue', category: null});
          });
        });

        describe("to hasOne property", function () {
          firstId = secondId = null;

          before(async function(){
            await setupUnique(true, ['supplierId'])();
            
            const firstSupplier = await Supplier.create({name: 'first'});
            firstId = firstSupplier.id;

            const secondSupplier = await Supplier.create({name: 'second'});
            secondId = secondSupplier.id;
          });

          it("should return validation error if hasOne property also matches", async function() {
            await Product.create({name: 'red', supplierId: firstId});

            const err = await Product.create({name: 'red', supplierId: firstId}).catch(e => e);
            should.exist(err);
            should.equal(err.msg, 'not-unique');
          });

          it("should pass if hasOne property is different", async function () {
            await Product.create({name: 'blue', supplierId: firstId});
            await Product.create({name: 'blue', supplierId: secondId});
          });

          // In SQL unique index land, NULL values are not considered equal.
          it("should pass if other property is null", async function () {
            await Product.create({name: 'blue', category: null});
            await Product.create({name: 'blue', category: null});
          });
        });
      });

      describe("ignoreCase", function () {
        if (protocol != 'mysql') {
          it("false should do a case sensitive comparison", async function () {
            await setupUnique(false, false)();

            await Product.create({name: 'spork'});
            await Product.create({name: 'spOrk'});
          });
        }

        it("true should do a case insensitive comparison", async function () {
          await setupUnique(true, false)();

          await Product.create({name: 'stapler'});

          const err = await Product.create({name: 'staplER'}).catch(e => e);
          should.exist(err);
          should.equal(err.msg, 'not-unique');
        });

        it("true should do a case insensitive comparison on scoped properties too", async function () {
          await setupUnique(true, ['category'], "name already taken for this category")();

          await Product.create({name: 'black', category: 'pen'});

          const err = await Product.create({name: 'Black', category: 'Pen'}).catch(e => e);
          should.exist(err);
          should.equal(err.msg, "name already taken for this category");
        });

      });
    });
  });

  describe("instance.returnAllErrors = false", function() {
    describe("properties.required = false", function() {
      before(setup(false, false));

      it("should save when properties are null", async function() {
        var john = new Person();

        await john.save();
        should.exist(john[Person.id]);
      });

      it("shouldn't save when a property is invalid", async function() {
        var john = new Person({ height: 4 });

        const err = await john.save().catch(e => e);
        should.notEqual(err, null);
        should.equal(err.property, 'height');
        should.equal(err.value,     4);
        should.equal(err.msg,      'out-of-range-number');
        should.equal(err.type,     'validation');
        should.equal(john.id,      null);
      });
    });

    describe("properties.required = true", function() {
      before(setup(false, true));

      it("should not save when properties are null", async function() {
        var john = new Person();

        const err = await john.save().catch(e => e);
        should.notEqual(err, null);
        should.equal(john.id, null);
      });

      it("should return a required error when the first property is blank", async function() {
        var john = new Person({ height: 4 });

        const err = await john.save().catch(e => e);
        should.notEqual(err, null);
        should.equal(err.property, 'name');
        should.equal(err.value,    null);
        should.equal(err.msg,      'required');
        should.equal(err.type,     'validation');
        should.equal(john.id,      null);
      });
    });
  });

  describe("instance.returnAllErrors = true", function() {
    describe("properties.required = false", function() {
      before(setup(true, false));

      it("should return all errors when a property is invalid", async function() {
        var john = new Person({ name: 'n', height: 4 });

        const err = await john.save().catch(e => e);
        should.notEqual(err, null);
        should(Array.isArray(err));
        should.equal(err.length, 2);

        should.deepEqual(err[0], _.extend(new Error('out-of-range-length'), {
          property: 'name', value: 'n', msg: 'out-of-range-length', type: 'validation'
        }));

        should.deepEqual(err[1], _.extend(new Error('out-of-range-number'), {
          property: 'height', value: 4, msg: 'out-of-range-number', type: 'validation'
        }));

        should.equal(john.id, null);
      });
    });

    describe("properties.required = true", function() {
      before(setup(true, true));

      it("should return required and user specified validation errors", async function() {
        var john = new Person({ height: 4 });

        const err = await john.save().catch(e => e);
        should.notEqual(err, null);
        should(Array.isArray(err));
        should.equal(err.length, 3);

        should.deepEqual(err[0], _.extend(new Error('required'), {
          property: 'name', value: null, msg: 'required', type: 'validation'
        }));

        should.deepEqual(err[1], _.extend(new Error('undefined'), {
          property: 'name', value: null, msg: 'undefined', type: 'validation'
        }));

        should.deepEqual(err[2], _.extend(new Error('out-of-range-number'), {
          property: 'height', value: 4, msg: 'out-of-range-number', type: 'validation'
        }));

        should.equal(john.id, null);
      });
    });
  });

  describe("mockable", function() {
    before(setup());

    it("validate should be writable", async function() {
      var John = new Person({
        name: "John"
      });
      var validateCalled = false;
      John.validate = function(cb) {
        validateCalled = true;
        cb(null);
      };
      await new Promise((resolve) => {
        John.validate(function(err) {
          should.equal(validateCalled,true);
          resolve();
        });
      });
    });
  });


});

