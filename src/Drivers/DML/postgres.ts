import _ from 'lodash';
import { Buffer } from 'buffer';
const pg = require('pg');
const QueryLib = require('sql-query');
import * as shared from './_shared';
import * as DDL from '../DDL/SQL';
import type { IDriver, DriverSettings, DriverDefineOptions } from '../../types/Driver';

interface DriverConfig {
  timezone?: string;
  query?: any;
  ssl?: boolean;
  [key: string]: any;
}

interface DriverOpts {
  debug?: boolean;
  pool?: boolean;
  [key: string]: any;
}

interface SwitchableFunctions {
  connect(this: any, cb?: (err?: Error | null) => void): Promise<void> | void;
  execSimpleQuery(this: any, query: string, cb?: (err: Error | null, rows?: any[]) => void): Promise<any[]> | void;
}

const resolveWithCallback = <T>(promise: Promise<T>, cb?: (err: Error | null, result?: T) => void): Promise<T> | void => {
  if (typeof cb === "function") {
    promise.then((result) => cb(null, result)).catch((err: Error) => cb(err));
    return;
  }
  return promise;
};

const resolveVoidWithCallback = (promise: Promise<void>, cb?: (err: Error | null) => void): Promise<void> | void => {
  if (typeof cb === "function") {
    promise.then(() => cb(null)).catch((err: Error) => cb(err));
    return;
  }
  return promise;
};

const isConnectionClosedError = (err: any): boolean => {
  if (!err || typeof err !== "object") {
    return false;
  }

  const message = typeof err.message === "string" ? err.message.toLowerCase() : "";
  return message.includes("client was closed") || message.includes("client has already been closed") || message.includes("not queryable");
};

const objectValuesToBuffer = (value: any): Buffer => {
  if (Array.isArray(value)) {
    return Buffer.from(value);
  }

  if (value && typeof value === "object") {
    const ordered = Object.keys(value)
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => (value as Record<string, any>)[key]);
    return Buffer.from(ordered);
  }

  if (typeof value === "string") {
    return Buffer.from(value, "binary");
  }

  return Buffer.alloc(0);
};

const parseJsonLikeToBuffer = (value: string): Buffer | null => {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return Buffer.from(parsed);
    }
    if (parsed && typeof parsed === "object") {
      return objectValuesToBuffer(parsed);
    }
  } catch (err) {
    return null;
  }
  return null;
};

const fromMaybeJsonBuffer = (buf: Buffer): Buffer => {
  if (!Buffer.isBuffer(buf) || buf.length === 0) {
    return buf;
  }

  const firstByte = buf[0];
  if (firstByte === 0x7b || firstByte === 0x5b) { // '{' or '['
    const parsed = parseJsonLikeToBuffer(buf.toString());
    if (parsed) {
      return parsed;
    }
  }

  return buf;
};

const switchableFunctions = {
  pool: {
    connect: function (this: any, cb?: (err?: Error | null) => void): Promise<void> | void {
      const promise = (async () => {
        const client = await (this.db as any).connect();
        try {
          this.connected = true;
        } finally {
          if (client && typeof client.release === "function") {
            client.release();
          }
        }
      })();

      return resolveVoidWithCallback(promise, cb);
    },
    execSimpleQuery: function (this: any, query: string, cb?: (err: Error | null, rows?: any[]) => void): Promise<any[]> | void {
      const promise = (async () => {
        if (this.opts.debug) {
          require("../../Debug").sql('postgres', query);
        }

        const client = await (this.db as any).connect();
        try {
          const result = await client.query(query);
          return result.rows;
        } finally {
          if (client && typeof client.release === "function") {
            client.release();
          }
        }
      })();

      return resolveWithCallback(promise, cb);
    }
  },
  client: {
    connect: function (this: any, cb?: (err?: Error | null) => void): Promise<void> | void {
      const promise = (async () => {
        await (this.db as any).connect();
        this.connected = true;
      })();

      return resolveVoidWithCallback(promise, cb);
    },
    execSimpleQuery: function (this: any, query: string, cb?: (err: Error | null, rows?: any[]) => void): Promise<any[]> | void {
      const promise = (async () => {
        if (this.opts.debug) {
          require("../../Debug").sql('postgres', query);
        }

        const runQuery = async (): Promise<any[]> => {
          const result = await (this.db as any).query(query);
          return result.rows;
        };

        if (!this.connected) {
          await this.connect();
        }

        try {
          return await runQuery();
        } catch (err) {
          if (isConnectionClosedError(err)) {
            this.connected = false;
            await this.connect();
            return await runQuery();
          }
          throw err;
        }
      })();

      return resolveWithCallback(promise, cb);
    }
  }
};

export function Driver(this: any, config?: DriverConfig, connection?: any, opts?: DriverOpts) {
  const functions: SwitchableFunctions = switchableFunctions.client as any;

  this.dialect = 'postgresql';
  this.config = config || {};
  this.opts = opts || {};

  if (!this.config.timezone) {
    this.config.timezone = "local";
  }

  this.query = new QueryLib.Query({ dialect: this.dialect, timezone: this.config.timezone });
  this.customTypes = {};
  this.connected = false;

  if (connection) {
    this.db = connection;
    this.connected = true;
  } else {
    if (this.config.query && this.config.query.ssl) {
      config!.ssl = true;
      this.config = _.extend(this.config, config);
    }

    pg.types.setTypeParser(20, Number);

    if (opts && opts.pool) {
      _.extend(this.constructor.prototype, switchableFunctions.pool);
      this.db = new pg.Pool(this.config);
    } else {
      _.extend(this.constructor.prototype, switchableFunctions.client);
      this.db = new pg.Client(this.config);
    }
  }

  this.aggregate_functions = [
    "ABS", "CEIL", "FLOOR", "ROUND",
    "AVG", "MIN", "MAX",
    "LOG", "EXP", "POWER",
    "ACOS", "ASIN", "ATAN", "COS", "SIN", "TAN",
    "RANDOM", "RADIANS", "DEGREES",
    "SUM", "COUNT",
    "DISTINCT"
  ];
}

_.extend(Driver.prototype, shared, DDL);

Driver.prototype.on = function (ev: string, cb: Function): any {
  if (ev === "error") {
    this.db.on("error", cb);
  }
  return this;
};

Driver.prototype.ping = function (cb?: (err: Error | null) => void): Promise<void> | void {
  const promise = (async () => {
    await this.execSimpleQuery("SELECT * FROM pg_stat_activity LIMIT 1");
  })();

  return resolveVoidWithCallback(promise, cb);
};

Driver.prototype.close = function (cb?: (err: Error | null) => void): Promise<void> | void {
  const promise = (async () => {
    try {
      if (this.db && typeof this.db.end === "function") {
        await this.db.end();
      }
    } finally {
      if (this.opts && this.opts.pool) {
        this.db = new pg.Pool(this.config);
      } else {
        this.db = new pg.Client(this.config);
      }
      this.connected = false;
    }
  })();

  return resolveVoidWithCallback(promise, cb);
};

Driver.prototype.getQuery = function (): any {
  return this.query;
};

Driver.prototype.find = function (
  fields: any,
  table: string,
  conditions: any,
  opts: any,
  cb?: (err: Error | null, rows?: any[]) => void
): Promise<any[]> | void {
  let q = this.query.select().from(table).select(fields);

  if (opts.offset) {
    q.offset(opts.offset);
  }
  if (typeof opts.limit === "number") {
    q.limit(opts.limit);
  }
  if (opts.order) {
    for (let i = 0; i < opts.order.length; i++) {
      q.order(opts.order[i][0], opts.order[i][1]);
    }
  }

  if (opts.merge) {
    q.from(opts.merge.from.table, opts.merge.from.field, opts.merge.to.field).select(opts.merge.select);
    if (opts.merge.where && Object.keys(opts.merge.where[1]).length) {
      q = q.where(opts.merge.where[0], opts.merge.where[1], opts.merge.table || null, conditions);
    } else {
      q = q.where(opts.merge.table || null, conditions);
    }
  } else {
    q = q.where(conditions);
  }

  if (opts.exists) {
    for (const k in opts.exists) {
      q.whereExists(opts.exists[k].table, table, opts.exists[k].link, opts.exists[k].conditions);
    }
  }

  q = q.build();

  const promise = this.execSimpleQuery(q);

  return resolveWithCallback(promise, cb);
};

Driver.prototype.count = function (
  table: string,
  conditions: any,
  opts: any,
  cb?: (err: Error | null, rows?: any[]) => void
): Promise<any[]> | void {
  let q = this.query.select().from(table).count(null, 'c');

  if (opts.merge) {
    q.from(opts.merge.from.table, opts.merge.from.field, opts.merge.to.field);
    if (opts.merge.where && Object.keys(opts.merge.where[1]).length) {
      q = q.where(opts.merge.where[0], opts.merge.where[1], conditions);
    } else {
      q = q.where(conditions);
    }
  } else {
    q = q.where(conditions);
  }

  if (opts.exists) {
    for (const k in opts.exists) {
      q.whereExists(opts.exists[k].table, table, opts.exists[k].link, opts.exists[k].conditions);
    }
  }

  q = q.build();

  const promise = this.execSimpleQuery(q);

  return resolveWithCallback(promise, cb);
};

Driver.prototype.insert = function (
  table: string,
  data: any,
  keyProperties: any[],
  cb?: (err: Error | null, ids?: any) => void
): Promise<any> | void {
  const q = this.query.insert().into(table).set(data).build();

  const promise = (async () => {
    const results = await this.execSimpleQuery(q + " RETURNING *");

    const ids: any = {};
    if (keyProperties) {
      for (let i = 0; i < keyProperties.length; i++) {
        const prop = keyProperties[i];
        ids[prop.name] = results[0][prop.mapsTo] !== undefined ? results[0][prop.mapsTo] : null;
      }
    }

    return ids;
  })();

  return resolveWithCallback(promise, cb);
};

Driver.prototype.update = function (
  table: string,
  changes: any,
  conditions: any,
  cb?: (err: Error | null, rows?: any[]) => void
): Promise<any[]> | void {
  const q = this.query.update().into(table).set(changes).where(conditions).build();

  const promise = this.execSimpleQuery(q);

  return resolveWithCallback(promise, cb);
};

Driver.prototype.remove = function (
  table: string,
  conditions: any,
  cb?: (err: Error | null, rows?: any[]) => void
): Promise<any[]> | void {
  const q = this.query.remove().from(table).where(conditions).build();

  const promise = this.execSimpleQuery(q);

  return resolveWithCallback(promise, cb);
};

Driver.prototype.clear = function (
  table: string,
  cb?: (err: Error | null, rows?: any[]) => void
): Promise<any[]> | void {
  const q = "TRUNCATE TABLE " + this.query.escapeId(table);

  const promise = this.execSimpleQuery(q);

  return resolveWithCallback(promise, cb);
};

Driver.prototype.valueToProperty = function (value: any, property: any): any {
  let customType: any;
  let v: any;

  switch (property.type) {
    case "object":
      if (typeof value === "object" && !Buffer.isBuffer(value)) {
        break;
      }
      try {
        value = JSON.parse(value);
      } catch (e) {
        value = null;
      }
      break;
    case "point":
      if (typeof value === "string") {
        const m = value.match(/\((\-?[\d\.]+)[\s,]+(\-?[\d\.]+)\)/);

        if (m) {
          value = { x: parseFloat(m[1]), y: parseFloat(m[2]) };
        }
      }
      break;
    case "date":
      if (_.isDate(value) && this.config.timezone && this.config.timezone !== 'local') {
        const tz = convertTimezone(this.config.timezone);

        value.setTime(value.getTime() - (value.getTimezoneOffset() * 60000));

        if (tz !== false) {
          value.setTime(value.getTime() - (tz * 60000));
        }
      }
      break;
    case "binary":
      if (value === null || typeof value === "undefined") {
        break;
      }

      if (Buffer.isBuffer(value)) {
        value = fromMaybeJsonBuffer(value);
        break;
      }

      if (typeof value === "string") {
        if (value.startsWith("\\x") || value.startsWith("0x")) {
          const hex = value.replace(/^\\x|^0x/i, "");
          value = Buffer.from(hex, "hex");
          break;
        }

        const parsedBuffer = parseJsonLikeToBuffer(value);
        if (parsedBuffer) {
          value = parsedBuffer;
          break;
        }

        value = Buffer.from(value, "binary");
        break;
      }

      if (Array.isArray(value) || (value && typeof value === "object")) {
        value = objectValuesToBuffer(value);
      }
      break;
    case "number":
      if (typeof value === 'string') {
        switch (value.trim()) {
          case 'Infinity':
          case '-Infinity':
          case 'NaN':
            value = Number(value);
            break;
          default:
            v = parseFloat(value);
            if (Number.isFinite(v)) {
              value = v;
            }
        }
      }
      break;
    case "integer":
      if (typeof value === 'string') {
        v = parseInt(value);

        if (Number.isFinite(v)) {
          value = v;
        }
      }
      break;
    default:
      customType = this.customTypes[property.type];

      if (customType && 'valueToProperty' in customType) {
        value = customType.valueToProperty(value);
      }
  }
  return value;
};

Driver.prototype.propertyToValue = function (value: any, property: any): any {
  let customType: any;

  switch (property.type) {
    case "object":
      if (value !== null && !Buffer.isBuffer(value)) {
        value = (Buffer as any).from ? (Buffer as any).from(JSON.stringify(value)) : new Buffer(JSON.stringify(value));
      }
      break;
    case "date":
      if (_.isDate(value) && this.config.timezone && this.config.timezone !== 'local') {
        const tz = convertTimezone(this.config.timezone);

        value.setTime(value.getTime() + (value.getTimezoneOffset() * 60000));
        if (tz !== false) {
          value.setTime(value.getTime() + (tz * 60000));
        }
      }
      break;
    case "point":
      return function () {
        return "POINT(" + value.x + ', ' + value.y + ")";
      };
    default:
      customType = this.customTypes[property.type];

      if (customType && 'propertyToValue' in customType) {
        value = customType.propertyToValue(value);
      }
  }
  return value;
};

// ==================== IDriver Implementation ====================

/**
 * Get driver settings
 */
Driver.prototype.getSettings = function (this: any): DriverSettings {
  return {
    dataTypes: this.query.dataTypes || {},
    escapeId: (name: string) => this.query.escapeId(name),
    escapeVal: (val: unknown) => this.query.escape(val)
  };
};

/**
 * Define a model in the database
 */
Driver.prototype.define = function (this: any, definition: DriverDefineOptions): void {
  // TODO: Implement explicit model definition if needed
  // Currently handled through sync() in DDL
};

/**
 * Get current database connection
 */
Driver.prototype.getConnection = function (this: any): unknown {
  return this.db;
};

Object.defineProperty(Driver.prototype, "isSql", {
  value: true
});

function convertTimezone(tz: string): number | false {
  if (tz === "Z") {
    return 0;
  }

  const m = tz.match(/([\+\-\s])(\d\d):?(\d\d)?/);

  if (m) {
    return (m[1] === '-' ? -1 : 1) * (parseInt(m[2], 10) + ((m[3] ? parseInt(m[3], 10) : 0) / 60)) * 60;
  }
  return false;
}

const asyncCompatMethods = [
  "connect",
  "execSimpleQuery",
  "ping",
  "find",
  "count",
  "insert",
  "update",
  "remove",
  "clear",
  "close"
];

for (const method of asyncCompatMethods) {
  (Driver.prototype as any)[`${method}Async`] = function (...args: any[]) {
    return (this as any)[method](...args);
  };
}
