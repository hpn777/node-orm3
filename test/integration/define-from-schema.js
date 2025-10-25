const should = require('should');
const helper = require('../support/spec_helper');
const common = require('../common');

describe('Schema-driven model definitions', function () {
  let db = null;
  let Seed = null;
  let PetSeed = null;

  before(async function () {
    db = await new Promise((resolve) => helper.connect(resolve));

    Seed = db.define('meta_schema_seed', {
      id: { type: 'serial', key: true },
      name: { type: 'text', required: true },
      age: { type: 'number' },
      is_active: { type: 'boolean', defaultValue: true },
      created_at: { type: 'date', time: true }
    }, {
      table: 'meta_define_people',
      id: 'id'
    });

    PetSeed = db.define('meta_schema_pet_seed', {
      id: { type: 'serial', key: true },
      person_id: { type: 'integer', required: false },
      nickname: { type: 'text', required: true },
      is_active: { type: 'boolean', defaultValue: 1 },
      created_at: { type: 'date', time: true }
    }, {
      table: 'meta_define_pets',
      id: 'id'
    });

  await helper.dropSync([Seed, PetSeed]);
  });

  after(async function () {
    if (Seed) {
      try {
        await Seed.drop();
      } catch (err) {
        if (common.protocol() !== 'sqlite') {
          throw err;
        }
      }
    }

    if (PetSeed) {
      try {
        await PetSeed.drop();
      } catch (err) {
        if (common.protocol() !== 'sqlite') {
          throw err;
        }
      }
    }

    if (db) {
      await db.close();
    }
  });

  describe('ORM#defineFromSchema()', function () {
    describe('basic usage', function () {
    it('creates a model based on the existing schema', async function () {
      const MetaPerson = await db.defineFromSchema('meta_define_people', {
        name: 'MetaPerson',
        namingStrategy: 'camelCase'
      });

      MetaPerson.table.should.equal('meta_define_people');
      MetaPerson.properties.should.have.property('id');
      MetaPerson.properties.id.serial.should.equal(true);
      MetaPerson.properties.should.have.property('name');
      MetaPerson.properties.name.required.should.equal(true);
      MetaPerson.properties.should.have.property('isActive');
      MetaPerson.properties.isActive.mapsTo.should.equal('is_active');

      const person = await MetaPerson.create({ name: 'Alice', age: 32 });
      person.should.have.property('id');
      should(person.id).be.a.Number();
      should([true, 1]).containEql(person.isActive);
    });
  });

  describe('property overrides', function () {
    it('applies overrides specified by column or property name', async function () {
      const MetaPersonOverrides = await db.defineFromSchema('meta_define_people', {
        name: 'MetaPersonOverrides',
        namingStrategy: 'camelCase',
        propertyOverrides: {
          is_active: { required: false },
          isActive: { defaultValue: false }
        }
      });

      MetaPersonOverrides.properties.should.have.property('isActive');
      MetaPersonOverrides.properties.isActive.required.should.equal(false);
      MetaPersonOverrides.properties.isActive.defaultValue.should.equal(false);

      const person = await MetaPersonOverrides.create({ name: 'Bob', age: 41 });
      should([false, 0]).containEql(person.isActive);
    });
  });
  });

  describe('ORM#defineAllFromSchema()', function () {
    it('creates models for every matching table with shared options', async function () {
      const models = await db.defineAllFromSchema({
        tables: (tableName) => tableName.startsWith('meta_define_'),
        modelNamingStrategy: 'pascalCase',
        defineOptions: {
          namingStrategy: 'camelCase'
        },
        tableOptions: {
          meta_define_people: {
            propertyOverrides: {
              is_active: { defaultValue: false }
            }
          }
        }
      });

      models.should.have.property('MetaDefinePeople');
      models.should.have.property('MetaDefinePets');

      const PeopleModel = models.MetaDefinePeople;
      PeopleModel.properties.should.have.property('isActive');
      PeopleModel.properties.isActive.defaultValue.should.equal(false);

      const PetsModel = models.MetaDefinePets;
      PetsModel.properties.should.have.property('nickname');
      PetsModel.properties.should.have.property('isActive');

      const created = await PeopleModel.create({ name: 'Charlie', age: 21 });
      should([false, 0]).containEql(created.isActive);
    });

    it('can skip individual tables via overrides', async function () {
      const models = await db.defineAllFromSchema({
        tables: (tableName) => tableName.startsWith('meta_define_'),
        modelNamingStrategy: 'pascalCase',
        tableOptions: {
          meta_define_pets: { skip: true }
        }
      });

      models.should.have.property('MetaDefinePeople');
      models.should.not.have.property('MetaDefinePets');
    });
  });
});
