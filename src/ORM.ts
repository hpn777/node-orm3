import _ from 'lodash';
import async from 'async';
import enforce from './Validators/index';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { parse as parseUrl } from 'url';
import * as path from 'path';

import * as adapters from './Adapters';
import DriverAliases from './Drivers/aliases';
import ORMError from './Error';
import Model from './Model';
import Settings from './Settings';
import Singleton from './Singleton';
import * as Utilities from './Utilities';
import Validators from './Validators/Validators';
import type { Plugin } from './types/Core';
import type { MetadataInspector, MetadataOptions, Table } from './Drivers/DDL/meta';
import type { Column as MetadataColumn } from './Drivers/DDL/meta/column';
import { mapColumnToProperty } from './Drivers/DDL/meta/propertyMapper';

import Query from './SQLQuery';
import type {
  ORMInterface,
  ModelOptions,
  ConnectionOptions,
  ConnectCallback,
  Model as ModelType,
  ChainRunner,
  SerialRunner,
  Instance as OrmInstance,
  PropertyDefinition,
  DefineModelFromSchemaOptions,
  SchemaNamingStrategy,
  DefineModelsFromSchemaOptions,
  ModelNamingStrategy
} from './types/Core';

const OPTS_TYPE_STRING = 'string';
const OPTS_TYPE_OBJ = 'object';

/**
 * @deprecated Use the `enforce` package directly instead
 */
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

export async function connect(opts: string | ConnectionOptions): Promise<ORM> {
  return new Promise((resolve, reject) => {
    if (arguments.length === 0 || !opts || !optsChecker(opts)) {
      reject(new ORMError("CONNECTION_URL_EMPTY", 'PARAM_MISMATCH'));
      return;
    }

    let parsedOpts: any;
    let originalUri: string | undefined;
    if (typeof opts === 'string') {
      if (opts.trim().length === 0) {
        reject(new ORMError("CONNECTION_URL_EMPTY", 'PARAM_MISMATCH'));
        return;
      }
      parsedOpts = parseUrl(opts, true);
      originalUri = opts;
    } else if (typeof opts === 'object') {
      parsedOpts = _.cloneDeep(opts);
      if (typeof (opts as any).href === 'string') {
        originalUri = (opts as any).href;
      } else if (typeof (opts as any).url === 'string') {
        originalUri = (opts as any).url;
      }
    }

    if (typeof parsedOpts.href === 'string' && parsedOpts.href.length > 0) {
      originalUri = originalUri || parsedOpts.href;
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
      reject(new ORMError("CONNECTION_URL_NO_PROTOCOL", 'PARAM_MISMATCH'));
      return;
    }

    if (parsedOpts.auth) {
      parsedOpts.user = parsedOpts.auth.split(":")[0];
      parsedOpts.password = parsedOpts.auth.split(":")[1];
    }
    let userProvided = Object.prototype.hasOwnProperty.call(parsedOpts, "user");
    let passwordProvided = Object.prototype.hasOwnProperty.call(parsedOpts, "password");
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

    if ((!parsedOpts.host || parsedOpts.host.length === 0) || (!parsedOpts.database || parsedOpts.database.length === 0)) {
      const envKey = `${proto.toUpperCase()}_DB_URL`;
      const envUrl = process.env[envKey];

      if (envUrl) {
        const envParsed = parseUrl(envUrl, true);

        if (!parsedOpts.host || parsedOpts.host.length === 0) {
          parsedOpts.host = envParsed.hostname || (envParsed as any).host;
        }

        if (!parsedOpts.port && envParsed.port) {
          parsedOpts.port = envParsed.port;
        }

        if ((!parsedOpts.database || parsedOpts.database.length === 0) && envParsed.pathname) {
          parsedOpts.database = envParsed.pathname.replace(/^\//, '');
        }

        if ((!parsedOpts.user || parsedOpts.user === "root") && envParsed.auth) {
          parsedOpts.user = envParsed.auth.split(":")[0];
          userProvided = true;
        }

        if ((!parsedOpts.password || parsedOpts.password.length === 0) && envParsed.auth && envParsed.auth.indexOf(":") >= 0) {
          parsedOpts.password = envParsed.auth.split(":")[1];
          passwordProvided = true;
        }

        if (envParsed.query) {
          parsedOpts.query = Object.assign({}, envParsed.query, parsedOpts.query || {});
        }

        if (typeof envUrl === 'string' && envUrl.length > 0) {
          parsedOpts.href = envUrl;
          originalUri = envUrl;
        }
      }
    }

    parsedOpts.__connectionUri = originalUri;
    parsedOpts.__authProvided = Boolean(parsedOpts.auth) || userProvided || passwordProvided;
    parsedOpts.__userProvided = userProvided;
    parsedOpts.__passwordProvided = passwordProvided;

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
        if (err) {
          reject(err);
        } else {
          resolve(db);
        }
      });
    } catch (ex: any) {
      if (ex.code === "MODULE_NOT_FOUND" || ex.message.indexOf('find module') > -1) {
        reject(new ORMError("Connection protocol not supported - have you installed the database driver for " + proto + "?", 'NO_SUPPORT'));
      } else {
        reject(ex);
      }
    }
  });
}

export async function use(connection: any, proto: string, opts?: any): Promise<ORM> {
  if (DriverAliases[proto]) {
    proto = DriverAliases[proto];
  }
  if (typeof opts === "function") {
    opts = {};
  }

  return new Promise((resolve, reject) => {
    try {
      const Driver = adapters.get(proto);
      const settingsContainer = new Settings.Container(settings.get('*'));
      const driver = new Driver(null, connection, {
        debug: (opts && opts.query && opts.query.debug === 'true'),
        settings: settingsContainer
      });

      resolve(new ORM(proto, driver, settingsContainer));
    } catch (ex) {
      reject(ex as Error);
    }
  });
}

export const Text = Query.Text;
for (const k in Query.Comparators) {
  (exports as any)[Query.Comparators[k]] = (Query as any)[Query.Comparators[k]];
}

export function express(...args: any[]): any {
  return require("./Express").apply(null, args);
}

export const addAdapter = (adapters as any).add;


class ORM extends EventEmitter implements ORMInterface {
  validators: any;
  enforce: any;
  settings: any;
  driver_name: string;
  driver: any;
  tools: any;
  models: Record<string, ModelType<any>>;
  plugins: Plugin[];
  customTypes: any;

  constructor(driver_name: string, driver: any, settings: any) {
    super();

    this.validators = validators;
    this.enforce = enforce;
    this.settings = settings;
    this.driver_name = driver_name;
  this.driver = driver;
  this.driver.uid = randomUUID();
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

  async ping(cb?: (err?: Error | null) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      this.driver.ping((err?: Error) => {
        if (typeof cb === "function") {
          try {
            cb(err || undefined);
          } catch (callbackErr) {
            reject(callbackErr as Error);
            return;
          }
        }

        if (err) reject(err);
        else resolve();
      });
    });
  }

  async close(cb?: (err?: Error | null) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      this.driver.close((err?: Error) => {
        if (typeof cb === "function") {
          try {
            cb(err || undefined);
          } catch (callbackErr) {
            reject(callbackErr as Error);
            return;
          }
        }

        if (err) reject(err);
        else resolve();
      });
    });
  }

  async load(...files: Array<string | string[] | ((err?: Error | null) => void)>): Promise<void> {
    const args = files.slice();
    let callback: ((err?: Error | null) => void) | undefined;
    if (args.length && typeof args[args.length - 1] === 'function') {
      callback = args.pop() as (err?: Error | null) => void;
    }

    const collected: string[] = [];

    const collect = (entry: string | string[] | ((err?: Error | null) => void) | undefined): void => {
      if (!entry) return;
      if (typeof entry === 'function') return;
      if (Array.isArray(entry)) {
        for (const item of entry) {
          collect(item);
        }
      } else if (typeof entry === 'string') {
        collected.push(entry);
      }
    };

    args.forEach(arg => collect(arg));

    return new Promise((resolve, reject) => {
      fileLoader.call(this, collected, (err?: Error | null) => {
        if (err) {
          if (callback) {
            try {
              callback(err);
            } catch (cbErr) {
              return reject(cbErr as Error);
            }
          }
          reject(err);
        } else {
          if (callback) {
            try {
              callback(null);
            } catch (cbErr) {
              return reject(cbErr as Error);
            }
          }
          resolve();
        }
      });
    });
  }

  async sync(): Promise<void> {
    const modelIds = Object.keys(this.models);
    for (const modelId of modelIds) {
      try {
        await this.models[modelId].sync();
      } catch (err) {
        if (err && typeof err === 'object') {
          (err as any).model = modelId;
        }
        throw err;
      }
    }
  }

  async drop(): Promise<void> {
    const modelIds = Object.keys(this.models);
    for (const modelId of modelIds) {
      try {
        await this.models[modelId].drop();
      } catch (err) {
        if (err && typeof err === 'object') {
          (err as any).model = modelId;
        }
        throw err;
      }
    }
  }

  getMetadata(options?: MetadataOptions): MetadataInspector {
    if (typeof this.driver?.getMetadata !== 'function') {
      throw new ORMError("Metadata inspection is not supported by this driver", 'NO_SUPPORT');
    }

    return this.driver.getMetadata(options);
  }

  async defineFromSchema<T = any>(tableName: string, options?: DefineModelFromSchemaOptions<T>): Promise<ModelType<T>> {
    if (typeof tableName !== 'string' || tableName.trim().length === 0) {
      throw new ORMError("defineFromSchema() requires a non-empty table name", 'PARAM_MISMATCH');
    }

    const inspector = this.getMetadata(options);
    const columns = await inspector.getColumns(tableName) as unknown as MetadataColumn[];

    if (!Array.isArray(columns) || columns.length === 0) {
      throw new ORMError(`Unable to inspect columns for table '${tableName}'`, 'BAD_MODEL', { table: tableName });
    }

    const namingStrategy: SchemaNamingStrategy = options?.namingStrategy ?? 'preserve';
    const overrides = options?.propertyOverrides ?? {};
    const properties: Record<string, PropertyDefinition> = {};
    const primaryKeys = new Set<string>();
    const usedNames = new Set<string>();

    for (const column of columns) {
      const columnName = column.getName();
      const propertyName = reservePropertyName(columnName, namingStrategy, usedNames);

      let property = mapColumnToProperty(column);

      const columnOverride = overrides[columnName];
      const propertyOverride = overrides[propertyName];
      const overrideSources: Array<Partial<PropertyDefinition>> = [];

      if (columnOverride) {
        overrideSources.push(_.cloneDeep(columnOverride));
      }

      if (propertyOverride && propertyOverride !== columnOverride) {
        overrideSources.push(_.cloneDeep(propertyOverride));
      }

      if (overrideSources.length) {
        property = Object.assign(property, ...overrideSources);
      }

      if (column.isAutoIncrementing()) {
        property.serial = true;
        if (!property.type) {
          property.type = 'serial';
        }

        if (!Object.prototype.hasOwnProperty.call(property, 'required')) {
          property.required = false;
        }
      }

      const hasDefault = Object.prototype.hasOwnProperty.call(property, 'defaultValue');
      if (!Object.prototype.hasOwnProperty.call(property, 'required')) {
        property.required = !column.isNullable() && property.serial !== true && !hasDefault;
      }

      if (column.isUnique() && !Object.prototype.hasOwnProperty.call(property, 'unique')) {
        property.unique = true;
      }

      if (propertyName !== columnName && !Object.prototype.hasOwnProperty.call(property, 'mapsTo')) {
        property.mapsTo = columnName;
      }

      if (column.isPrimaryKey() && property.key !== true) {
        property.key = true;
      }

      const columnMeta = {
        name: column.getName(),
        dataType: column.getDataType(),
        notNull: !column.isNullable(),
        maxLength: column.getMaxLength() ?? null,
        primaryKey: column.isPrimaryKey(),
        defaultValue: column.getDefaultValue(),
        unique: column.isUnique(),
        autoIncrement: column.isAutoIncrementing(),
        referencedTableName: column.getReferencedTableName(),
        referencedColumnName: column.getReferencedColumnName(),
        onUpdate: column.getUpdateRule(),
        onDelete: column.getDeleteRule(),
      };
      Object.defineProperty(property, 'meta', {
        value: columnMeta,
        enumerable: false,
        configurable: true,
        writable: false,
      });

      properties[propertyName] = property;

      if (property.key === true) {
        primaryKeys.add(propertyName);
      }
    }

    let resolvedKeys = Array.from(primaryKeys);
    const optionId = options?.modelOptions?.id;

    if (resolvedKeys.length === 0 && optionId) {
      resolvedKeys = Array.isArray(optionId) ? optionId.slice() : [optionId];
    }

    if (resolvedKeys.length === 0) {
      throw new ORMError(`Unable to determine primary key(s) for table '${tableName}'. Provide options.modelOptions.id to override.`, 'BAD_MODEL', { table: tableName });
    }

    for (const keyName of resolvedKeys) {
      if (properties[keyName]) {
        properties[keyName].key = true;
      }
    }

    const baseModelOptions: Partial<ModelOptions<T>> = options?.modelOptions ? _.cloneDeep(options.modelOptions) : {};
    const finalId = baseModelOptions.id ?? (resolvedKeys.length === 1 ? resolvedKeys[0] : resolvedKeys);
    baseModelOptions.table = baseModelOptions.table ?? tableName;
    baseModelOptions.id = finalId;

    const model = this.define<T>(options?.name ?? tableName, properties, baseModelOptions as ModelOptions<T>);
    return model;
  }

  async defineAllFromSchema(options?: DefineModelsFromSchemaOptions): Promise<Record<string, ModelType<any>>> {
    const inspector = this.getMetadata(options);
    try {
      const tables = await inspector.getTables();

      const includeViews = Boolean(options?.includeViews);
      const matchTable = createTableMatcher(options?.tables);
      const baseDefineOptions = options?.defineOptions ? _.cloneDeep(options.defineOptions) : undefined;
      const tableOptions = options?.tableOptions ?? {};
      const models: Record<string, ModelType<any>> = {};

      for (const table of tables) {
        if (!includeViews && table.getType() === 'VIEW') {
          continue;
        }

        const tableName = table.getName();
        if (!matchTable(tableName, table)) {
          continue;
        }

        const tableOverride = tableOptions[tableName];
        if (tableOverride?.skip) {
          continue;
        }

        const { skip: _skip, ...restOverrides } = tableOverride ?? {};
        const mergedOptions = mergeDefineModelOptions(baseDefineOptions, restOverrides);

        if (!mergedOptions.schema && options?.schema) {
          mergedOptions.schema = options.schema;
        }

        const modelName = mergedOptions.name
          || buildModelName(tableName, options?.modelNamingStrategy, options?.modelNamePrefix);

        if (this.models[modelName]) {
          models[modelName] = this.models[modelName];
          continue;
        }

        mergedOptions.name = modelName;

        try {
          const model = await this.defineFromSchema(tableName, mergedOptions);
          models[modelName] = model;
        } catch (err) {
          if (err && typeof err === 'object') {
            (err as any).table = tableName;
            (err as any).operation = 'defineAllFromSchema';
          }
          throw err;
        }
      }

      return models;
    } finally {
      await inspector.close();
    }
  }

  /**
   * Execute a set of chain runners sequentially, collecting each result set.
   *
   * The returned runner can be awaited directly or invoked with a callback
   * for legacy consumers. Results are typed according to the provided chain
   * runners, preserving strong typing across chained queries.
   */
  serial<T = OrmInstance>(...chains: ChainRunner<T>[]): SerialRunner<T> {
    function get(): Promise<T[][]>;
    function get(cb: (err: Error | null, ...results: T[][]) => void): Promise<void>;
    async function get(cb?: (err: Error | null, ...results: T[][]) => void): Promise<T[][] | void> {
      try {
        const results: T[][] = [];
        for (const chain of chains) {
          if (!chain || typeof (chain as any).run !== 'function') {
            throw new TypeError('serial() expects chain-like arguments exposing run()');
          }

          const instances = await chain.run();
          results.push(instances || []);
        }

        if (typeof cb === 'function') {
          cb(null, ...results);
          return;
        }

        return results;
      } catch (err) {
        if (typeof cb === 'function') {
          cb(err as Error);
          return;
        }
        throw err;
      }
    }

    return { get } as SerialRunner<T>;
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

function createTableMatcher(option?: DefineModelsFromSchemaOptions['tables']): (tableName: string, table: Table) => boolean {
  if (!option) {
    return () => true;
  }

  if (Array.isArray(option)) {
    const normalized = new Set(option.map((name) => name.toLowerCase()));
    return (tableName: string) => normalized.has(tableName.toLowerCase());
  }

  if (option instanceof RegExp) {
    return (tableName: string) => option.test(tableName);
  }

  if (typeof option === 'function') {
    return option;
  }

  return () => true;
}

function mergeDefineModelOptions(
  base?: Partial<DefineModelFromSchemaOptions<any>>,
  override?: Partial<DefineModelFromSchemaOptions<any>>,
): DefineModelFromSchemaOptions<any> {
  const merged = _.merge({}, _.cloneDeep(base ?? {}), _.cloneDeep(override ?? {}));
  return merged as DefineModelFromSchemaOptions<any>;
}

function buildModelName(
  tableName: string,
  strategy: ModelNamingStrategy = 'pascalCase',
  prefix = '',
): string {
  let core: string;

  switch (strategy) {
    case 'preserve':
      core = tableName;
      break;
    case 'camelCase':
      core = _.camelCase(tableName);
      break;
    case 'pascalCase':
    default:
      core = _.upperFirst(_.camelCase(tableName));
      break;
  }

  if (prefix && !core.startsWith(prefix)) {
    return `${prefix}${core}`;
  }

  return core;
}

function reservePropertyName(columnName: string, strategy: SchemaNamingStrategy, usedNames: Set<string>): string {
  const baseName = strategy === 'camelCase' ? (_.camelCase(columnName) || columnName) : columnName;
  let candidate = baseName;
  let attempt = 1;

  while (usedNames.has(candidate)) {
    candidate = `${baseName}_${attempt}`;
    attempt += 1;
  }

  usedNames.add(candidate);
  return candidate;
}

export default ORM;
