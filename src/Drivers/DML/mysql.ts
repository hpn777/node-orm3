import * as _ from "lodash";
const mysql = require("mysql");
const QueryLib = require("sql-query");
import * as shared from "./_shared";
import * as DDL from "../DDL/SQL";
import { PropertyDefinition } from "../../types/Core";
import type { IDriver, DriverSettings, DriverDefineOptions } from "../../types/Driver";

export { Driver };

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

function Driver(this: any, config: any, connection: any, opts: any) {
  this.dialect = 'mysql';
  this.config = config || {};
  this.opts   = opts || {};
  this.customTypes = {};

  if (!this.config.timezone) {
    this.config.timezone = "local";
  }

  this.query  = new QueryLib.Query({ dialect: this.dialect, timezone: this.config.timezone });

  this.reconnect(null, connection);

  this.aggregate_functions = [ "ABS", "CEIL", "FLOOR", "ROUND",
                               "AVG", "MIN", "MAX",
                               "LOG", "LOG2", "LOG10", "EXP", "POWER",
                               "ACOS", "ASIN", "ATAN", "COS", "SIN", "TAN",
                               "CONV", [ "RANDOM", "RAND" ], "RADIANS", "DEGREES",
                               "SUM", "COUNT",
                               "DISTINCT"];
}

_.extend(Driver.prototype, shared, DDL);

Driver.prototype.ping = function (this: any, cb?: (err: Error | null) => void): Promise<void> | void {
  const promise = new Promise<void>((resolve, reject) => {
    this.db.ping((err: Error | null) => {
      if (err) return reject(err);
      resolve();
    });
  });

  return resolveVoidWithCallback(promise, cb);
};

Driver.prototype.on = function (this: any, ev: string, cb: (err: Error) => void) {
  if (ev == "error") {
    this.db.on("error", cb);
    this.db.on("unhandledError", cb);
  }
  return this;
};

Driver.prototype.connect = function (this: any, cb?: (err: Error | null) => void): Promise<void> | void {
  const promise = new Promise<void>((resolve, reject) => {
    if (this.opts.pool) {
      this.db.pool.getConnection((err: Error | null, con: any) => {
        if (!err && con) {
          if (typeof con.release === "function") {
            con.release();
          } else if (typeof con.end === "function") {
            con.end();
          }
        }
        if (err) return reject(err);
        resolve();
      });
      return;
    }

    this.db.connect((err: Error | null) => {
      if (err) return reject(err);
      resolve();
    });
  });

  return resolveVoidWithCallback(promise, cb);
};

Driver.prototype.reconnect = function (this: any, cb: ((err: Error | null) => void) | null, connection?: any) {
  var connOpts = this.config.href || this.config;

  // Prevent noisy mysql driver output
  if (typeof connOpts == 'object') {
    connOpts = _.omit(connOpts, 'debug');
  }
  if (typeof connOpts == 'string') {
    connOpts = connOpts.replace("debug=true", "debug=false");
  }

  this.db = (connection ? connection : mysql.createConnection(connOpts));
  if (this.opts.pool) {
    this.db.pool = (connection ? connection : mysql.createPool(connOpts));
  }
  if (typeof cb == "function") {
    this.connect(cb);
  }
};

Driver.prototype.close = function (this: any, cb?: (err: Error | null) => void): Promise<void> | void {
  const promise = new Promise<void>((resolve, reject) => {
    const done = (err: Error | null) => (err ? reject(err) : resolve());

    if (this.opts.pool) {
      this.db.pool.end(done);
    } else {
      this.db.end(done);
    }
  });

  return resolveVoidWithCallback(promise, cb);
};

Driver.prototype.getQuery = function (this: any): any {
  return this.query;
};

Driver.prototype.execSimpleQuery = function (this: any, query: string, cb?: (err: Error | null, data?: any) => void): Promise<any> | void {
  const promise = new Promise<any>((resolve, reject) => {
    if (this.opts.debug) {
      require("../../Debug").sql('mysql', query);
    }

    const handleResult = (err: Error | null, data?: any) => {
      if (err) return reject(err);
      resolve(data);
    };

    if (this.opts.pool) {
      this.db.pool.getConnection((err: Error | null, con: any) => {
        if (err) return reject(err);

        const release = () => {
          if (!con) return;
          if (typeof con.release === "function") {
            con.release();
          } else if (typeof con.end === "function") {
            con.end();
          }
        };

        con.query(query, (queryErr: Error | null, data: any) => {
          release();
          handleResult(queryErr, data);
        });
      });
    } else {
      this.db.query(query, handleResult);
    }
  });

  return resolveWithCallback(promise, cb);
};

Driver.prototype.find = function (this: any, fields: string[], table: string, conditions: any, opts: any, cb?: (err: Error | null, data?: any) => void): Promise<any> | void {
  var q = this.query.select()
                    .from(table).select(fields);

  if (opts.offset) {
    q.offset(opts.offset);
  }
  if (typeof opts.limit == "number") {
    q.limit(opts.limit);
  } else if (opts.offset) {
    // OFFSET cannot be used without LIMIT so we use the biggest BIGINT number possible
    q.limit('18446744073709551615');
  }
  if (opts.order) {
    for (var i = 0; i < opts.order.length; i++) {
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
    for (var k in opts.exists) {
      q.whereExists(opts.exists[k].table, table, opts.exists[k].link, opts.exists[k].conditions);
    }
  }

  q = q.build();

  const promise = this.execSimpleQuery(q) as Promise<any>;

  return resolveWithCallback(promise, cb);
};

Driver.prototype.count = function (this: any, table: string, conditions: any, opts: any, cb?: (err: Error | null, data?: any) => void): Promise<any> | void {
  var q = this.query.select()
                    .from(table)
                    .count(null, 'c');

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
    for (var k in opts.exists) {
      q.whereExists(opts.exists[k].table, table, opts.exists[k].link, opts.exists[k].conditions);
    }
  }

  q = q.build();

  const promise = this.execSimpleQuery(q) as Promise<any>;

  return resolveWithCallback(promise, cb);
};

Driver.prototype.insert = function (this: any, table: string, data: any, keyProperties: PropertyDefinition[] | null, cb?: (err: Error | null, ids?: any) => void): Promise<any> | void {
  var q = this.query.insert()
                    .into(table)
                    .set(data)
                    .build();

  const promise = (async () => {
    const info = await this.execSimpleQuery(q) as any;

    const ids: Record<string, unknown> = {};
    if (keyProperties) {
      if (keyProperties.length === 1 && Object.prototype.hasOwnProperty.call(info, "insertId") && info.insertId !== 0) {
        ids[keyProperties[0].name!] = info.insertId;
      } else {
        for (let i = 0; i < keyProperties.length; i++) {
          const prop = keyProperties[i];
          ids[prop.name!] = data[prop.mapsTo!];
        }
      }
    }

    return ids;
  })();

  return resolveWithCallback(promise, cb);
};

Driver.prototype.update = function (this: any, table: string, changes: any, conditions: any, cb?: (err: Error | null) => void): Promise<any> | void {
  var q = this.query.update()
                    .into(table)
                    .set(changes)
                    .where(conditions)
                    .build();

  const promise = this.execSimpleQuery(q) as Promise<any>;

  return resolveWithCallback(promise, cb);
};

Driver.prototype.remove = function (this: any, table: string, conditions: any, cb?: (err: Error | null) => void): Promise<any> | void {
  var q = this.query.remove()
                    .from(table)
                    .where(conditions)
                    .build();

  const promise = this.execSimpleQuery(q) as Promise<any>;

  return resolveWithCallback(promise, cb);
};

Driver.prototype.clear = function (this: any, table: string, cb?: (err: Error | null) => void): Promise<any> | void {
  var q = "TRUNCATE TABLE " + this.query.escapeId(table);

  const promise = this.execSimpleQuery(q) as Promise<any>;

  return resolveWithCallback(promise, cb);
};

Driver.prototype.valueToProperty = function (this: any, value: any, property: PropertyDefinition): any {
  var customType: any;

  switch (property.type) {
    case "boolean":
      value = !!value;
      break;
    case "object":
      if (typeof value == "object" && !Buffer.isBuffer(value)) {
        break;
      }
      try {
        value = JSON.parse(value);
      } catch (e) {
        value = null;
      }
      break;
    default:
      customType = this.customTypes[property.type!];
      if(customType && 'valueToProperty' in customType) {
        value = customType.valueToProperty(value);
      }
  }
  return value;
};

Driver.prototype.propertyToValue = function (this: any, value: any, property: PropertyDefinition): any {
  var customType: any;

  switch (property.type) {
    case "boolean":
      value = (value) ? 1 : 0;
      break;
    case "object":
      if (value !== null) {
        value = JSON.stringify(value);
      }
      break;
    case "point":
      return function() { return 'POINT(' + value.x + ', ' + value.y + ')'; };
      break;
    default:
      customType = this.customTypes[property.type!];
      if(customType && 'propertyToValue' in customType) {
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
 * Define a model in the database (placeholder - uses DDL.sync pattern)
 */
Driver.prototype.define = function (this: any, definition: DriverDefineOptions): void {
  // TODO: Implement explicit model definition if needed
  // Currently handled through sync() in DDL
};

/**
 * Get current database connection
 */
Driver.prototype.getConnection = function (this: any): unknown {
  if (this.opts.pool) {
    return this.db.pool;
  }
  return this.db;
};

Object.defineProperty(Driver.prototype, "isSql", {
    value: true
});

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
