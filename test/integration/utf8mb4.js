var should   = require('should');
var helper   = require('../support/spec_helper');
var ORM      = require('../../');
var common   = require('../common');

describe("UTF8mb4", function() {
  var db = null;
  var Text;

  var setup = function () {
    return async function () {
      Text = db.define("utf8mb4text", {
        value: String
      });

      ORM.singleton.clear();

  await helper.dropSync(Text);
      await Text.create({ value: 'Hello 😃' });
    };
  };

  before(async function () {
    var opts = {};

    if (common.protocol() == 'mysql') {
      opts = { query: { charset: 'utf8mb4' }};
    }

  db = await helper.connect(opts);
  });

  after(async function () {
    await db.close();
  });

  describe("strings", function () {
    before(setup());

    it("should be stored", async function () {
      var item = await Text.one();
      should.exist(item);
      should.equal(item.value, 'Hello 😃');
    });
  });
});
