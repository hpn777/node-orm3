import * as _ from "lodash";
const sqlite3 = require("sqlite3");
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
  this.dialect = 'sqlite';
  this.config = config || {};
  this.opts   = opts || {};

  if (!this.config.timezone) {
    this.config.timezone = "local";
  }

  this.query  = new QueryLib.Query({ dialect: this.dialect, timezone: this.config.timezone });
  this.customTypes = {};

  if (connection) {
    this.db = connection;
  } else {
    // on Windows, paths have a drive letter which is parsed by
    // url.parse() as the hostname. If host is defined, assume
    // it's the drive letter and add ":"
    if (process.platform == "win32" && config.host && config.host.match(/^[a-z]$/i)) {
      this.db = new sqlite3.Database(decodeURIComponent((config.host ? config.host + ":" : "") + (config.pathname || "")) || ':memory:');
    } else {
      this.db = new sqlite3.Database(decodeURIComponent((config.host ? config.host : "") + (config.pathname || "")) || ':memory:');
    }

  }

  this.aggregate_functions = [ "ABS", "ROUND",
                               "AVG", "MIN", "MAX",
                               "RANDOM",
                               "SUM", "COUNT",
                               "DISTINCT" ];
}

_.extend(Driver.prototype, shared, DDL);

Driver.prototype.ping = function (this: any, cb?: (err: Error | null) => void): Promise<void> | void {
  const promise = new Promise<void>((resolve) => {
    process.nextTick(() => resolve());
  });

  return resolveVoidWithCallback(promise, cb);
};

Driver.prototype.on = function (this: any, ev: string, cb: (err: Error) => void) {
  if (ev == "error") {
    this.db.on("error", cb);
  }
  return this;
};

Driver.prototype.connect = function (this: any, cb?: (err: Error | null) => void): Promise<void> | void {
  const promise = new Promise<void>((resolve) => {
    process.nextTick(() => resolve());
  });

  return resolveVoidWithCallback(promise, cb);
};

Driver.prototype.close = function (this: any, cb?: (err: Error | null) => void): Promise<void> | void {
  const promise = new Promise<void>((resolve, reject) => {
    this.db.close((err: Error | null) => {
      if (err) return reject(err);
      resolve();
    });
  });

  return resolveVoidWithCallback(promise, cb);
};

Driver.prototype.getQuery = function (this: any): any {
  return this.query;
};

Driver.prototype.execSimpleQuery = function (this: any, query: string, cb?: (err: Error | null, data?: any) => void): Promise<any> | void {
  const promise = new Promise<any>((resolve, reject) => {
    if (this.opts.debug) {
      require("../../Debug").sql('sqlite', query);
    }

    this.db.all(query, (err: Error | null, rows: any) => {
      if (err) return reject(err);
      resolve(rows);
    });
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
    // OFFSET cannot be used without LIMIT so we use the biggest INTEGER number possible
    q.limit('9223372036854775807');
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

  if (this.opts.debug) {
    require("../../Debug").sql('sqlite', q);
  }

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

  if (this.opts.debug) {
    require("../../Debug").sql('sqlite', q);
  }

  const promise = this.execSimpleQuery(q) as Promise<any>;

  return resolveWithCallback(promise, cb);
};

Driver.prototype.insert = function (this: any, table: string, data: any, keyProperties: PropertyDefinition[] | null, cb?: (err: Error | null, ids?: any) => void): Promise<any> | void {
  var q = this.query.insert()
                    .into(table)
                    .set(data)
                    .build();

  if (this.opts.debug) {
    require("../../Debug").sql('sqlite', q);
  }

  const promise = (async () => {
    await this.execSimpleQuery(q);

    if (!keyProperties || keyProperties.length === 0) {
      return undefined;
    }

    if (keyProperties.length === 1 && keyProperties[0].type === 'serial') {
      const row = await new Promise<any>((resolve, reject) => {
        this.db.get("SELECT last_insert_rowid() AS last_row_id", (err: Error | null, fetchedRow: any) => {
          if (err) return reject(err);
          resolve(fetchedRow);
        });
      });

      const ids: Record<string, unknown> = {};
      ids[keyProperties[0].name!] = row?.last_row_id;
      return ids;
    }

    const ids: Record<string, unknown> = {};
    for (let i = 0; i < keyProperties.length; i++) {
      const prop = keyProperties[i];
      ids[prop.name!] = data[prop.mapsTo!] !== undefined ? data[prop.mapsTo!] : null;
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

  if (this.opts.debug) {
    require("../../Debug").sql('sqlite', q);
  }

  const promise = this.execSimpleQuery(q) as Promise<any>;

  return resolveWithCallback(promise, cb);
};

Driver.prototype.remove = function (this: any, table: string, conditions: any, cb?: (err: Error | null) => void): Promise<any> | void {
  var q = this.query.remove()
                    .from(table)
                    .where(conditions)
                    .build();

  if (this.opts.debug) {
    require("../../Debug").sql('sqlite', q);
  }

  const promise = this.execSimpleQuery(q) as Promise<any>;

  return resolveWithCallback(promise, cb);
};

Driver.prototype.clear = function (this: any, table: string, cb?: (err: Error | null) => void): Promise<void> | void {
  const promise = (async () => {
    await this.execQueryAsync("DELETE FROM ??", [table]);
    const data = await this.execQueryAsync("SELECT count(*) FROM ?? WHERE type=? AND name=?;", ['sqlite_master', 'table', 'sqlite_sequence']);

    const hasSequence = data[0] && (data[0]['count(*)'] === 1 || data[0]['COUNT(*)'] === 1 || data[0]['count'] === 1);
    if (hasSequence) {
      await this.execQueryAsync("DELETE FROM ?? WHERE NAME = ?", ['sqlite_sequence', table]);
    }
  })();

  return resolveVoidWithCallback(promise, cb);
};

Driver.prototype.valueToProperty = function (this: any, value: any, property: PropertyDefinition): any {
  var v: number, customType: any;

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
    case "number":
      if (typeof value == 'string') {
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
      if (typeof value == 'string') {
        v = parseInt(value);

        if (Number.isFinite(v)) {
          value = v;
        }
      }
      break;
    case "date":
      if (typeof value == 'string') {
        const hasTrailingZ = value.indexOf('Z', value.length - 1) !== -1;

        value = new Date(hasTrailingZ ? value : value + 'Z');

        if (this.config.timezone && this.config.timezone != 'local') {
          var tz = convertTimezone(this.config.timezone);

          if (tz !== false) {
            // shift UTC to timezone
            value.setTime(value.getTime() - (tz * 60000));
          }
        } else if (hasTrailingZ) {
          // align to current local timezone offset
          const localOffsetMinutes = (new Date()).getTimezoneOffset();
          value.setTime(value.getTime() + (localOffsetMinutes * 60000));
        }
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
    case "date":
      if (this.config.query && this.config.query.strdates) {
        if (value instanceof Date) {
          var year = value.getUTCFullYear();
          var month: any = value.getUTCMonth() + 1;
          if (month < 10) {
            month = '0' + month;
          }
          var date: any = value.getUTCDate();
          if (date < 10) {
            date = '0' + date;
          }
          var strdate: any = year + '-' + month + '-' + date;
          if (property.time === false) {
            value = strdate;
            break;
          }

          var hours: any = value.getUTCHours();
          if (hours < 10) {
            hours = '0' + hours;
          }
          var minutes: any = value.getUTCMinutes();
          if (minutes < 10) {
            minutes = '0' + minutes;
          }
          var seconds: any = value.getUTCSeconds();
          if (seconds < 10) {
            seconds = '0' + seconds;
          }
          var millis: any = value.getUTCMilliseconds();
          if (millis < 10) {
            millis = '0' + millis;
          }
          if (millis < 100) {
            millis = '0' + millis;
          }
          strdate += ' ' + hours + ':' + minutes + ':' + seconds + '.' + millis + '000';
          value = strdate;
        }
      }
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

const asyncCompatMethods = [
  'ping',
  'execSimpleQuery',
  'find',
  'count',
  'insert',
  'update',
  'remove',
  'clear'
];

for (const method of asyncCompatMethods) {
  (Driver.prototype as any)[`${method}Async`] = function (...args: any[]) {
    return (this[method] as Function).apply(this, args);
  };
}

function convertTimezone(tz: string): number | false {
  if (tz == "Z") return 0;

  var m = tz.match(/([\+\-\s])(\d\d):?(\d\d)?/);
  if (m) {
    return (m[1] == '-' ? -1 : 1) * (parseInt(m[2], 10) + ((m[3] ? parseInt(m[3], 10) : 0) / 60)) * 60;
  }
  return false;
}
