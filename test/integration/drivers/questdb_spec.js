var should = require('should');
var Driver = require('../../../dist/Drivers/DML/questdb').Driver;
var helper = require('../../support/spec_helper');
var common = require('../../common');

if (common.protocol() != 'questdb') return;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connectWithRetry(context) {
  const attempts = Number(process.env.QUESTDB_BOOT_ATTEMPTS || 40);
  const delayMs = Number(process.env.QUESTDB_BOOT_DELAY || 2000);
  const timeoutOverride = Number(process.env.QUESTDB_BOOT_TIMEOUT || 0);

  if (typeof context.timeout === 'function') {
    const computedTimeout = timeoutOverride > 0 ? timeoutOverride : (attempts * delayMs) + 5000;
    context.timeout(computedTimeout);
  }

  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await helper.connect();
    } catch (err) {
      lastError = err;

      const message = err && err.message ? err.message : String(err);
      if (process.env.DEBUG) {
        // eslint-disable-next-line no-console
        console.debug(`[questdb-spec] connection attempt ${attempt} failed: ${message}`);
      }

      if (attempt === attempts) {
        break;
      }

      await sleep(delayMs);
    }
  }

  throw lastError || new Error('QuestDB did not become ready in time');
}

describe('QuestDB driver', function () {
  let db;
  let driver;

  before(async function () {
    db = await connectWithRetry(this);
    driver = db.driver;
  });

  after(async function () {
    if (db) {
      await db.close();
    }
  });

  describe('execSimpleQuery', function () {
    it('runs arbitrary SQL', async function () {
      const rows = await driver.execSimpleQuery('SELECT 1 AS value');
      should(rows).be.Array().and.have.length(1);
      should(rows[0]).have.property('value', 1);
    });
  });

  describe('ping', function () {
    it('responds successfully', async function () {
      await driver.ping();
    });
  });

  describe('CRUD operations', function () {
    beforeEach(async function () {
      await driver.execSimpleQuery('DROP TABLE IF EXISTS abc');
      await driver.execSimpleQuery('CREATE TABLE abc (name STRING)');
    });

    it('finds rows', async function () {
      await driver.execSimpleQuery("INSERT INTO abc VALUES ('jane'), ('bob'), ('alice')");
      const rows = await driver.find(['name'], 'abc', { name: 'jane' }, {});
      should(rows).deepEqual([{ name: 'jane' }]);
    });

    it('counts rows', async function () {
      await driver.execSimpleQuery("INSERT INTO abc VALUES ('jane'), ('bob'), ('alice')");
      const rows = await driver.count('abc', {}, {});
      should(rows).deepEqual([{ c: 3 }]);
    });

    it('inserts rows', async function () {
      await driver.insert('abc', { name: 'jane' }, null);
      const rows = await driver.execSimpleQuery('SELECT COUNT(*) AS count FROM abc');
      should(rows).deepEqual([{ count: 1 }]);
    });

    it('updates rows', async function () {
      await driver.execSimpleQuery("INSERT INTO abc VALUES ('jane'), ('bob'), ('alice')");
      await driver.update('abc', { name: 'bob' }, { name: 'jane' });
      const rows = await driver.execSimpleQuery("SELECT COUNT(*) AS count FROM abc WHERE name = 'bob'");
      should(rows).deepEqual([{ count: 2 }]);
    });

    it('removes rows', async function () {
      await driver.execSimpleQuery("INSERT INTO abc VALUES ('jane'), ('bob'), ('alice')");
      await driver.remove('abc', { name: 'bob' });
      const rows = await driver.execSimpleQuery('SELECT name FROM abc ORDER BY name');
      should(rows).deepEqual([{ name: 'alice' }, { name: 'jane' }]);
    });

    it('clears tables', async function () {
      await driver.execSimpleQuery("INSERT INTO abc VALUES ('jane'), ('bob'), ('alice')");
      await driver.clear('abc');
      const rows = await driver.execSimpleQuery('SELECT COUNT(*) AS count FROM abc');
      should(rows).deepEqual([{ count: 0 }]);
    });
  });
});
