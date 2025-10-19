import _ from 'lodash';
import async from 'async';
import enforce from './shims/enforce';
import { EventEmitter } from 'events';
import hat from 'hat';
import { parse as parseUrl } from 'url';
import { inherits, promisify } from 'util';
import * as path from 'path';
import { createRequire } from 'module';

const adapters = require('./Adapters');
import DriverAliases from './Drivers/aliases';
import ORMError from './Error';
import Model from './Model';
import Settings from './Settings';
import Singleton from './Singleton';
import * as Utilities from './Utilities';
import Validators from './Validators';

const Query = require('sql-query');
import { ORMInterface, ModelOptions, ConnectionOptions, Plugin, ConnectCallback } from './types';

const OPTS_TYPE_STRING = 'string';
const OPTS_TYPE_OBJ = 'object';

// Deprecated, use enforce
export const validators = Validators;

// specific to ORM, not in enforce for now
(enforce as any).equalToProperty = (Validators as any).equalToProperty;
(enforce as any).unique = (Validators as any).unique;

export { enforce };
export { Singleton as singleton };
export const settings = new Settings.Container(Settings.defaults());

export { default as Property } from './Property';
export { Settings };
export const ErrorCodes = (ORMError as any).codes;

const optsChecker = function (opts: any): boolean {
  return [OPTS_TYPE_STRING, OPTS_TYPE_OBJ].some(function (element) { return typeof (opts) === element });
};

const fileLoader = function (this: ORM, filePaths: string[], cb: (err?: Error | null) => void): void {
  const self = this;
  
  // Get the caller's directory using stack introspection
  let callerDir = process.cwd();
  try {
    const stack = new Error().stack || '';
    const stackLines = stack.split('\n');
    // Find the first stack line that's not in this module
    for (let i = 0; i < stackLines.length; i++) {
      const line = stackLines[i];
      // Look for file paths in the stack trace
      const match = line.match(/\(([^)]+\.js):/);
      if (match) {
        const filePath = match[1];
        // Skip ORM.js and load.js files
        if (!filePath.includes('/dist/ORM.js') && 
            !filePath.includes('/src/ORM.ts')) {
          callerDir = path.dirname(filePath);
          break;
        }
      }
    }
  } catch (e) {
    // Ignore stack parsing errors
  }
  
  const iterator = function (filePath: string, cb: (err?: Error | null) => void): void {
    try {
      // Resolve relative paths from the caller's directory
      let resolvedPath = filePath;
      if (!path.isAbsolute(filePath) && !filePath.startsWith('.')) {
        // It's a module name, try to use require.resolve
        try {
          resolvedPath = require.resolve(filePath);
        } catch (e: unknown) {
          // If require.resolve fails, just use the filePath as-is
          resolvedPath = filePath;
        }
      } else if (!path.isAbsolute(filePath)) {
        // It's a relative path, resolve it from caller's directory
        resolvedPath = path.resolve(callerDir, filePath);
      }
      
      require(resolvedPath)(self, cb);
    } catch (err: unknown) {
      return cb(err as Error);
    }
  };

  async.eachSeries(filePaths, iterator as any, cb);
};

export function connect(opts: string | ConnectionOptions, cb?: ConnectCallback): ORM | EventEmitter {
  if (arguments.length === 0 || !opts || !optsChecker(opts)) {
    cb = typeof (cb) !== 'function' ? opts as any : cb;
    return ORM_Error(new ORMError("CONNECTION_URL_EMPTY", 'PARAM_MISMATCH'), cb);
  }

  let parsedOpts: any;
  if (typeof opts === 'string') {
    if (opts.trim().length === 0) {
      return ORM_Error(new ORMError("CONNECTION_URL_EMPTY", 'PARAM_MISMATCH'), cb);
    }
    parsedOpts = parseUrl(opts, true);
  } else if (typeof opts === 'object') {
    parsedOpts = _.cloneDeep(opts);
  }

  parsedOpts.query = parsedOpts.query || {};
  for (const k in parsedOpts.query) {
    parsedOpts.query[k] = queryParamCast(parsedOpts.query[k]);
    parsedOpts[k] = parsedOpts.query[k];
  }

  if (!parsedOpts.database) {
    parsedOpts.database = (parsedOpts.pathname ? parsedOpts.pathname.substr(1) : "");
  }
  if (!parsedOpts.protocol) {
    return ORM_Error(new ORMError("CONNECTION_URL_NO_PROTOCOL", 'PARAM_MISMATCH'), cb);
  }

  if (parsedOpts.auth) {
    parsedOpts.user = parsedOpts.auth.split(":")[0];
    parsedOpts.password = parsedOpts.auth.split(":")[1];
  }
  if (!Object.prototype.hasOwnProperty.call(parsedOpts, "user")) {
    parsedOpts.user = "root";
  }
  if (!Object.prototype.hasOwnProperty.call(parsedOpts, "password")) {
    parsedOpts.password = "";
  }
  if (Object.prototype.hasOwnProperty.call(parsedOpts, "hostname")) {
    parsedOpts.host = parsedOpts.hostname;
  }

  let proto = parsedOpts.protocol.replace(/:$/, '');
  let db: ORM;

  if (DriverAliases[proto]) {
    proto = DriverAliases[proto];
  }

  try {
    const Driver = adapters.get(proto);
    const settingsContainer = new Settings.Container(settings.get('*'));
    const driver = new Driver(parsedOpts, null, {
      debug: 'debug' in parsedOpts.query ? parsedOpts.query.debug : settingsContainer.get("connection.debug"),
      pool: 'pool' in parsedOpts.query ? parsedOpts.query.pool : settingsContainer.get("connection.pool"),
      settings: settingsContainer
    });

    db = new ORM(proto, driver, settingsContainer);

    driver.connect(function (err?: Error | null) {
      if (typeof cb === "function") {
        if (err) {
          return cb(err);
        } else {
          return cb(null, db);
        }
      }

      db.emit("connect", err, !err ? db : null);
    });
  } catch (ex: any) {
    if (ex.code === "MODULE_NOT_FOUND" || ex.message.indexOf('find module') > -1) {
      return ORM_Error(new ORMError("Connection protocol not supported - have you installed the database driver for " + proto + "?", 'NO_SUPPORT'), cb);
    }
    return ORM_Error(ex, cb);
  }

  return db!;
}

export const connectAsync = promisify(connect);

const use = function (connection: any, proto: string, opts: any, cb?: (err: Error | null, orm?: ORM) => void): void {
  if (DriverAliases[proto]) {
    proto = DriverAliases[proto];
  }
  if (typeof opts === "function") {
    cb = opts;
    opts = {};
  }

  try {
    const Driver = adapters.get(proto);
    const settingsContainer = new Settings.Container(settings.get('*'));
    const driver = new Driver(null, connection, {
      debug: (opts.query && opts.query.debug === 'true'),
      settings: settingsContainer
    });

    return cb!(null, new ORM(proto, driver, settingsContainer));
  } catch (ex) {
    return cb!(ex as Error);
  }
};

export const Text = Query.Text;
for (const k in Query.Comparators) {
  (exports as any)[Query.Comparators[k]] = (Query as any)[Query.Comparators[k]];
}

export function express(...args: any[]): any {
  return require("./Express").apply(null, args);
}

export { use };
export const useAsync = promisify(use);

export const addAdapter = (adapters as any).add;

class ORM extends EventEmitter implements ORMInterface {
  validators: any;
  enforce: any;
  settings: any;
  driver_name: string;
  driver: any;
  tools: any;
  models: Record<string, any>;
  plugins: Plugin[];
  customTypes: any;

  constructor(driver_name: string, driver: any, settings: any) {
    super();

    this.validators = validators;
    this.enforce = enforce;
    this.settings = settings;
    this.driver_name = driver_name;
    this.driver = driver;
    this.driver.uid = hat();
    this.tools = {};
    this.models = {};
    this.plugins = [];
    this.customTypes = {};

    for (const k in Query.Comparators) {
      this.tools[Query.Comparators[k]] = (Query as any)[Query.Comparators[k]];
    }

  const onError = (err: Error): void => {
      if (this.settings.get("connection.reconnect")) {
        if (typeof this.driver.reconnect === "undefined") {
          this.emit("error", new ORMError("Connection lost - driver does not support reconnection", 'CONNECTION_LOST'));
          return;
        }
        this.driver.reconnect(() => {
          this.driver.on("error", onError);
        });

        if (this.listeners("error").length === 0) {
          return;
        }
      }
  this.emit("error", err);
    };

    driver.on("error", onError);
  }

  use(plugin_const: string | Plugin, opts?: any): this {
    let plugin: any;

    if (typeof plugin_const === "string") {
      try {
        plugin_const = require(Utilities.getRealPath(plugin_const));
      } catch (e) {
        throw e;
      }
    }

    plugin = new (plugin_const as any)(this, opts || {});

    if (typeof plugin.define === "function") {
      for (const k in this.models) {
        plugin.define(this.models[k]);
      }
    }

    this.plugins.push(plugin);

    return this;
  }

  define<T = any>(name: string, properties?: Record<string, any>, opts?: ModelOptions<T>): any {
    let i: number;

    properties = properties || {};
    opts = opts || {};

    for (i = 0; i < this.plugins.length; i++) {
      if (typeof (this.plugins[i] as any).beforeDefine === "function") {
        (this.plugins[i] as any).beforeDefine(name, properties, opts);
      }
    }

    // Handle cache/identityCache option - create per-model settings if needed
    let modelSettings = this.settings;
    if (Object.prototype.hasOwnProperty.call(opts, "cache") || Object.prototype.hasOwnProperty.call(opts, "identityCache")) {
      // Create a new settings object that inherits from global settings
      const Settings = require('./Settings').default;
      modelSettings = new Settings.Container(this.settings.settings);
      const cacheValue = Object.prototype.hasOwnProperty.call(opts, "identityCache") ? (opts as any).identityCache : opts.cache;
      modelSettings.set("instance.identityCache", cacheValue);
    }

    this.models[name] = Model({
      db: this,
      settings: modelSettings,
      driver_name: this.driver_name,
      driver: this.driver,
      table: (opts as any).table || (opts as any).collection || ((this.settings.get("model.namePrefix") || "") + name),
      properties: properties,
      extension: (opts as any).extension || false,
      keys: opts.id,
      autoSave: Object.prototype.hasOwnProperty.call(opts, "autoSave") ? opts.autoSave : this.settings.get("instance.autoSave"),
      autoFetch: Object.prototype.hasOwnProperty.call(opts, "autoFetch") ? opts.autoFetch : this.settings.get("instance.autoFetch"),
      autoFetchLimit: (opts as any).autoFetchLimit || this.settings.get("instance.autoFetchLimit"),
      cascadeRemove: Object.prototype.hasOwnProperty.call(opts, "cascadeRemove") ? opts.cascadeRemove : this.settings.get("instance.cascadeRemove"),
      hooks: opts.hooks || {},
      methods: opts.methods || {},
      validations: opts.validations || {}
    });

    for (i = 0; i < this.plugins.length; i++) {
      if (typeof (this.plugins[i] as any).define === "function") {
        (this.plugins[i] as any).define(this.models[name], this);
      }
    }

    return this.models[name];
  }

  defineType(name: string, opts: any): this {
    this.customTypes[name] = opts;
    this.driver.customTypes[name] = opts;
    return this;
  }

  ping(cb: (err: Error | null) => void): this {
    this.driver.ping(cb);
    return this;
  }

  pingAsync(): Promise<void> {
    return promisify(this.ping.bind(this))() as any;
  }

  close(cb: (err: Error | null) => void): this {
    this.driver.close(cb);
    return this;
  }

  closeAsync(): Promise<void> {
    return promisify(this.close.bind(this))() as any;
  }

  load(...args: any[]): void {
    const files = _.flatten(args);
    let cb: Function = function () { };

    if (typeof files[files.length - 1] === "function") {
      cb = files.pop();
    }

    // Don't use getRealPath here - let fileLoader handle path resolution with correct caller context
    const filesWithPath: string[] = files;

    fileLoader.call(this, filesWithPath, cb as any);
  }

  loadAsync(...args: any[]): Promise<void> {
    const files = _.flatten(args);
    // Don't use getRealPath here - let fileLoader handle path resolution with correct caller context
    const filesWithPath: string[] = files;

    return promisify(fileLoader).call(this, filesWithPath) as any;
  }

  sync(cb: (err: Error | null) => void): this {
    const modelIds = Object.keys(this.models);
    const syncNext = (): void => {
      if (modelIds.length === 0) {
        return cb(null);
      }

      const modelId = modelIds.shift()!;

      this.models[modelId].sync(function (err?: Error | null) {
        if (err) {
          (err as any).model = modelId;
          return cb(err);
        }

        return syncNext();
      });
    };

    if (arguments.length === 0) {
      cb = function () { };
    }

    syncNext();

    return this;
  }

  syncAsync(): Promise<void> {
    return promisify(this.sync.bind(this))() as any;
  }

  syncPromise(): Promise<void> {
    return this.syncAsync();
  }

  drop(cb: (err: Error | null) => void): this {
    const modelIds = Object.keys(this.models);
    const dropNext = (): void => {
      if (modelIds.length === 0) {
        return cb(null);
      }

      const modelId = modelIds.shift()!;

      this.models[modelId].drop(function (err?: Error | null) {
        if (err) {
          (err as any).model = modelId;
          return cb(err);
        }

        return dropNext();
      });
    };

    if (arguments.length === 0) {
      cb = function () { };
    }

    dropNext();

    return this;
  }

  dropAsync(): Promise<void> {
    return promisify(this.drop).call(this) as any;
  }

  serial(...chains: any[]): any {
    return {
      get: (cb: Function) => {
        const params: any[] = [];
        const getNext = (): void => {
          if (params.length === chains.length) {
            params.unshift(null);
            return cb.apply(null, params);
          }

          chains[params.length].run(function (err: Error | null, instances?: any[]) {
            if (err) {
              params.unshift(err);
              return cb.apply(null, params);
            }

            params.push(instances);
            return getNext();
          });
        };

        getNext();

        return this;
      },
      getAsync: () => {
        return promisify(this.serial(...chains).get)();
      }
    };
  }
}

function ORM_Error(err: Error, cb?: ConnectCallback): EventEmitter {
  const Emitter: any = new EventEmitter();

  Emitter.use = Emitter.define = Emitter.sync = Emitter.load = function () { };

  if (typeof cb === "function") {
    cb(err);
  }

  process.nextTick(function () {
    Emitter.emit("connect", err);
  });

  return Emitter;
}

function queryParamCast(val: any): any {
  if (typeof val === 'string') {
    switch (val) {
      case '1':
      case 'true':
        return true;
      case '0':
      case 'false':
        return false;
    }
  }
  return val;
}

export default ORM;
