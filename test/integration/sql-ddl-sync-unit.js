const should = require('should');

const sqlDdlSync = require('../../dist/Drivers/DDL/sync');
const { Sync, dialect } = sqlDdlSync;

describe('embedded sql-ddl-sync', function () {
  it('creates collection when missing', function (done) {
    const executed = [];

    const driver = {
      dialect: 'sqlite',
      query: {
        escapeId(identifier) {
          return `"${identifier}"`;
        },
        escapeVal(value) {
          if (typeof value === 'number') {
            return value;
          }
          return `'${value}'`;
        }
      },
      customTypes: {},
      execQuery(sql, params, cb) {
        let callback = cb;
        let parameters = params;

        if (typeof params === 'function') {
          callback = params;
          parameters = undefined;
        }

        executed.push({ sql, params: parameters });

        if (!callback) {
          return;
        }

        setImmediate(() => {
          if (sql.indexOf('sqlite_master') !== -1) {
            callback(null, []);
          } else {
            callback(null);
          }
        });
      }
    };

    const sync = new Sync({ driver, debug: false });

    sync.defineCollection('test_table', {
      id: {
        type: 'serial',
        key: true
      },
      name: {
        type: 'text',
        required: true
      }
    });

    sync.sync((err, result) => {
      should.not.exist(err);
      should.exist(result);
      result.changes.should.be.aboveOrEqual(1);

      executed.some((entry) => typeof entry.sql === 'string' && entry.sql.indexOf('CREATE TABLE') === 0).should.be.true();

      done();
    });
  });

  it('exposes dialect helpers', function () {
    const sqliteDialect = dialect('sqlite');
    should.exist(sqliteDialect);
    sqliteDialect.should.have.property('createCollection').which.is.a.Function();
  });
});
