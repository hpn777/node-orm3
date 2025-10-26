var chalkModule = require("chalk");
var chalk    = chalkModule && chalkModule.default ? chalkModule.default : chalkModule;
var Mocha    = require("mocha");
var glob     = require("glob");
var path     = require("path");
var common   = require("./common");
var logging  = require("./logging");

var location = path.normalize(path.join(__dirname, "integration", "**", "*.js"));
var mocha    = new Mocha({
  reporter: "progress",
  timeout: 15000
});

switch (common.hasConfig(common.protocol())) {
  case 'not-defined':
    logging.error("There's no configuration for protocol **%s**", common.protocol());
    process.exit(0);
  case 'not-found':
    logging.error("**test/config.js** missing. Take a look at **test/config.example.js**");
    process.exit(0);
}

function shouldRunTest(file) {
  var name  = path.basename(file).slice(0, -3)
  var proto = common.protocol();
  var exclude = ['model-aggregate','property-number-size','smart-types'];

  if (proto == 'questdb') {
    // QuestDB support is currently partial. Only include tests that do not
    // depend on full INSERT/DELETE/RETURNING semantics or heavy DDL behaviour.
    // Keep the driver spec and a handful of safe, DB-agnostic suites.
    var allowed = [
      path.join('drivers', 'questdb_spec'),
      'error_spec',
      'orm-exports',
      'settings',
      'sql-ddl-sync-unit',
      'big',
      'model-create',
      'model-find',
      'model-clear',
      'instance-methods'
    ];

    return allowed.some(function (pattern) {
      return file.indexOf(pattern + '.js') >= 0;
    });
  }

  if (proto == "mongodb" && exclude.indexOf(name) >= 0) return false;

  return true;
}

function runTests() {
  glob.sync(location).forEach(function (file) {
    if (!shouldRunTest(file)) return;
    mocha.addFile(file);
  });

  logging.info("Testing **%s**", common.getConnectionString());

  mocha.run(function (failures) {
    process.exit(failures);
  });
}

runTests();
