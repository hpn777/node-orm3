var should   = require('should');
var helper   = require('../support/spec_helper');
var common   = require('../common');
var ORM      = require('../../');

if (common.protocol() == "mongodb") return;
if (common.protocol() == "sqlite" && !common.getConnectionConfig().pathname) {
  // sqlite needs a pathname for this test (because of reconnecting)
  // if using memory, when disconnecting everything is lost and this
  // test needs it
  return;
}

describe("Timezones", function() {
  var db    = null;
  var Event = null;

  var setup = function (opts) {
    return function (done) {
      helper.connect({ query: opts.query }, function (connection) {
        db = connection;
        db.settings.set('instance.identityCache', false);

        Event = db.define("event", {
          name : { type: 'text' },
          when : { type: 'date', time: true }
        });

        if (opts.sync) {
          return helper.dropSync(Event, done);
        } else {
          return done();
        }
      });
    };
  };

  describe("specified", function () {
    var a, zones = [ 'local', '-0734'/*, '+11:22'*/ ];

    for (a = 0; a < zones.length; a++ ) {
      describe(zones[a], function () {
        before(setup({ sync: true, query: { timezone: zones[a] } }));

        after(async function () {
          if (db) {
            await db.close();
            db = null;
          }
        });

        it("should get back the same date that was stored", async function() {
          if (common.protocol() === 'mysql') {
            return this.skip();
          }
          var when = new Date(2013, 12, 5, 5, 34, 27);

          await Event.create({ name: "raid fridge", when: when });
          const item = await Event.one({ name: "raid fridge" });
          item.when.should.eql(when);
        });
      });
    }
  });

  describe("different for each connection", function () {
    before(setup({
      sync  : true,
      query : { timezone: '+0200' }
    }));

    after(async function () {
      if (db) {
        await db.close();
        db = null;
      }
    });

    // This isn't consistent accross drivers. Needs more thinking and investigation.
    it("should get back a correctly offset time", async function() {
      if (common.protocol() === 'mysql') {
        return this.skip();
      }
      var when = new Date(2013, 12, 5, 5, 34, 27);

      const new_event = await Event.create({ name: "raid fridge", when: when });
      const item = await Event.one({ name: "raid fridge" });

  new_event.should.not.equal(item); // new_event was not cached
  should.equal(new_event.when.toISOString(), item.when.toISOString());

      await db.close();
      db = null;

      // Reconnect with different timezone using a fresh ORM instance
  const db2 = await helper.connect({ query: { timezone: '+0400' } });
      const Event2 = db2.define("event", {
        name : { type: 'text' },
        when : { type: 'date', time: true }
      });

      ORM.singleton.clear();

  const item2 = await Event2.one({ name: "raid fridge" });
  const expected = new Date(2013, 12, 5, 3, 34, 27);
  item2.when.should.eql(expected);

      await db2.close();
    });
  });
});
