import _ from 'lodash';
import { promisify } from 'util';
const pg = require('pg');
const QueryLib = require('sql-query');
import * as shared from './_shared';
import * as utils from './_utils';
import * as DDL from '../DDL/SQL';

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
  connect(this: any, cb: (err?: Error | null) => void): void;
  execSimpleQuery(this: any, query: string, cb: (err: Error | null, rows?: any[]) => void): any;
}

const switchableFunctions = {
  pool: {
    connect: function (this: any, cb: (err?: Error | null) => void): void {
      (this.db as any).connect(function (err: any, client: any, done: any) {
        if (!err) {
          done();
        }
        cb(err);
      });
    },
    execSimpleQuery: function (this: any, query: string, cb: (err: Error | null, rows?: any[]) => void): any {
      if (this.opts.debug) {
        require("../../Debug").sql('postgres', query);
      }
      (this.db as any).connect(function (err: any, client: any, done: any) {
        if (err) {
          return cb(err);
        }

        client.query(query, function (err: any, result: any) {
          done();

          if (err) {
            cb(err);
          } else {
            cb(null, result.rows);
          }
        });
      });
      return this;
    }
  },
  client: {
    connect: function (this: any, cb: (err?: Error | null) => void): void {
      (this.db as any).connect(cb);
    },
    execSimpleQuery: function (this: any, query: string, cb: (err: Error | null, rows?: any[]) => void): any {
      if (this.opts.debug) {
        require("../../Debug").sql('postgres', query);
      }
      (this.db as any).query(query, function (err: any, result: any) {
        if (err) {
          cb(err);
        } else {
          cb(null, result.rows);
        }
      });
      return this;
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

  if (connection) {
    this.db = connection;
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

  this.constructor.prototype.execSimpleQueryAsync = promisify(this.constructor.prototype.execSimpleQuery);

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

Driver.prototype.ping = function (cb: (err?: Error | null) => void): any {
  this.execSimpleQuery("SELECT * FROM pg_stat_activity LIMIT 1", function () {
    return cb();
  });
  return this;
};

Driver.prototype.close = function (cb?: (err?: Error | null) => void): void {
  this.db.end();

  if (typeof cb === "function") cb();

  return;
};

Driver.prototype.getQuery = function (): any {
  return this.query;
};

Driver.prototype.find = function (
  fields: any,
  table: string,
  conditions: any,
  opts: any,
  cb: (err: Error | null, rows?: any[]) => void
): void {
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

  this.execSimpleQuery(q, cb);
};

Driver.prototype.count = function (
  table: string,
  conditions: any,
  opts: any,
  cb: (err: Error | null, rows?: any[]) => void
): void {
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

  this.execSimpleQuery(q, cb);
};

Driver.prototype.insert = function (
  table: string,
  data: any,
  keyProperties: any[],
  cb: (err: Error | null, ids?: any) => void
): void {
  const q = this.query.insert().into(table).set(data).build();

  this.execSimpleQuery(q + " RETURNING *", function (err: Error | null, results?: any[]) {
    if (err) {
      return cb(err);
    }

    let i: number;
    const ids: any = {};
    let prop: any;

    if (keyProperties) {
      for (i = 0; i < keyProperties.length; i++) {
        prop = keyProperties[i];
        ids[prop.name] = results![0][prop.mapsTo] !== undefined ? results![0][prop.mapsTo] : null;
      }
    }
    return cb(null, ids);
  });
};

Driver.prototype.update = function (
  table: string,
  changes: any,
  conditions: any,
  cb: (err: Error | null, rows?: any[]) => void
): void {
  const q = this.query.update().into(table).set(changes).where(conditions).build();

  this.execSimpleQuery(q, cb);
};

Driver.prototype.remove = function (
  table: string,
  conditions: any,
  cb: (err: Error | null, rows?: any[]) => void
): void {
  const q = this.query.remove().from(table).where(conditions).build();

  this.execSimpleQuery(q, cb);
};

Driver.prototype.clear = function (
  table: string,
  cb: (err: Error | null, rows?: any[]) => void
): void {
  const q = "TRUNCATE TABLE " + this.query.escapeId(table);

  this.execSimpleQuery(q, cb);
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

utils.promisifyFunctions(Driver.prototype, ['ping', 'find', 'count', 'insert', 'update', 'remove', 'clear']);

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
