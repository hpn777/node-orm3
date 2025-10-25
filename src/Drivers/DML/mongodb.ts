/// <reference types="node" />

import { Buffer } from "buffer";
import { URLSearchParams } from "url";
import * as _ from "lodash";
import { PropertyDefinition } from "../../types/Core";
import type { IDriver, DriverSettings, DriverDefineOptions } from "../../types/Driver";

const mongodb: any = require("mongodb");

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
  this.client = null;
  this.db     = null;
  this.config = config || {};
  this.opts   = opts;

  if (!this.config.timezone) {
    this.config.timezone = "local";
  }

  this.opts.settings.set("properties.primary_key", "_id");
  this.opts.settings.set("properties.association_key", function (name: string, field: string) {
    return name + "_" + field.replace(/^_+/, '');
  });
}

Driver.prototype.sync = function (this: any, opts: any, cb?: (err: Error | null) => void): Promise<void> | void {
  const promise = (async () => {
    const collection = await new Promise<any>((resolve, reject) => {
      this.db.createCollection(opts.table, (err: Error | null, created: any) => {
        if (err) return reject(err);
        resolve(created);
      });
    });

    const indexes: string[] = [];

    for (let i = 0; i < opts.one_associations.length; i++) {
      if (opts.one_associations[i].extension) continue;
      if (opts.one_associations[i].reversed) continue;

      for (const k in opts.one_associations[i].field) {
        indexes.push(k);
      }
    }

    for (let i = 0; i < opts.many_associations.length; i++) {
      if (opts.many_associations[i].reversed) continue;
      indexes.push(opts.many_associations[i].name);
    }

    if (indexes.length === 0) {
      return;
    }

    await Promise.all(indexes.map((indexName: string) => new Promise<void>((resolve, reject) => {
      collection.createIndex(indexName, (err: Error | null) => {
        if (err) return reject(err);
        resolve();
      });
    })));
  })();

  return resolveVoidWithCallback(promise, cb);
};

Driver.prototype.drop = function (this: any, opts: any, cb?: (err?: Error | null) => void): Promise<void> | void {
  const promise = new Promise<void>((resolve, reject) => {
    this.db.collection(opts.table).drop((err?: Error | null) => {
      if (err && (err as any).code !== 26) {
        return reject(err as Error);
      }
      resolve();
    });
  });

  return resolveVoidWithCallback(promise, cb);
};

Driver.prototype.ping = function (this: any, cb?: (err: Error | null) => void): Promise<void> | void {
  const promise = new Promise<void>((resolve) => {
    process.nextTick(() => resolve());
  });

  return resolveVoidWithCallback(promise, cb);
};

Driver.prototype.on = function (this: any, ev: string, cb: (err: Error) => void) {
  // if (ev == "error") {
  //   this.db.on("error", cb);
  //   this.db.on("unhandledError", cb);
  // }
  return this;
};

Driver.prototype.connect = function (this: any, cb?: (err: Error | null) => void): Promise<void> | void {
  const uri = resolveConnectionString(this.config);

  const promise = (async () => {
    try {
      this.client = new mongodb.MongoClient(uri);
    } catch (err) {
      throw err as Error;
    }

    await this.client.connect();

    try {
      const dbName = (typeof this.config.database === "string" && this.config.database.length > 0)
        ? this.config.database
        : undefined;
      this.db = dbName ? this.client!.db(dbName) : this.client!.db();
    } catch (err) {
      this.db = this.client!.db();
    }
  })();

  return resolveVoidWithCallback(promise, cb);
};

Driver.prototype.close = function (this: any, cb?: (err: Error | null) => void): Promise<void> | void {
  const promise = (async () => {
    if (this.client) {
      await this.client.close();
    }
    this.db = null;
    this.client = null;
  })();

  return resolveVoidWithCallback(promise, cb);
};

Driver.prototype.find = function (this: any, fields: string[] | null, table: string, conditions: any, opts: any, cb?: (err: Error | null, docs?: any) => void): Promise<any> | void {
  const promise = (async () => {
    const collection = this.db.collection(table);

    convertToDB(conditions, this.config.timezone);

    const cursor = (fields ? collection.find(conditions, fields) : collection.find(conditions));

    if (opts.order) {
      const orders: any[] = [];

      for (let i = 0; i < opts.order.length; i++) {
        orders.push([ opts.order[i][0], (opts.order[i][1] == 'Z' ? 'desc' : 'asc') ]);
      }
      cursor.sort(orders);
    }
    if (opts.offset) {
      cursor.skip(opts.offset);
    }
    if (opts.limit) {
      cursor.limit(opts.limit);
    }

    const docs = await new Promise<any[]>((resolve, reject) => {
      cursor.toArray((err: Error | null, result: any[]) => {
        if (err) return reject(err);
        resolve(result || []);
      });
    });

    const processed = await Promise.all(docs.map((doc: any) => {
      convertFromDB(doc, this.config.timezone);

      if (opts.extra && opts.extra[doc._id]) {
        doc = _.merge(doc, _.omit(opts.extra[doc._id], '_id'));
      }

      if (!opts.createInstance) {
        return Promise.resolve(doc);
      }

      return new Promise<any>((resolve) => {
        const instance = opts.createInstance(doc, {
          extra: opts.extra_props
        }, () => {
          resolve(instance);
        });
      });
    }));

    return processed;
  })();

  return resolveWithCallback(promise, cb);
};

Driver.prototype.count = function (this: any, table: string, conditions: any, opts: any, cb?: (err: Error | null, data?: any) => void): Promise<any> | void {
  const promise = (async () => {
    const collection = this.db.collection(table);

    convertToDB(conditions, this.config.timezone);

    const cursor = collection.find(conditions);

    if (opts.order) {
      const orders: any[] = [];

      for (let i = 0; i < opts.order.length; i++) {
        orders.push([ opts.order[i][0], (opts.order[i][1] == 'Z' ? 'desc' : 'asc') ]);
      }
      cursor.sort(orders);
    }
    if (opts.offset) {
      cursor.skip(opts.offset);
    }
    if (opts.limit) {
      cursor.limit(opts.limit);
    }

    const count = await new Promise<number>((resolve, reject) => {
      cursor.count(true, (err: Error | null, result: number) => {
        if (err) return reject(err);
        resolve(result);
      });
    });

    return [{ c: count }];
  })();

  return resolveWithCallback(promise, cb);
};

Driver.prototype.insert = function (this: any, table: string, data: any, keyProperties: PropertyDefinition[] | null, cb?: (err: Error | null, ids?: any) => void): Promise<any> | void {
  const promise = (async () => {
    convertToDB(data, this.config.timezone);

    const docs = await new Promise<any[]>((resolve, reject) => {
      this.db.collection(table).insert(
        data,
        { w: 1 },
        (err: Error | null, inserted: any[]) => {
          if (err) return reject(err);
          resolve(inserted || []);
        }
      );
    });

    const ids: Record<string, unknown> = {};

    if (keyProperties && keyProperties.length && docs.length) {
      for (let i = 0; i < keyProperties.length; i++) {
        const prop = keyProperties[i];

        if (prop.mapsTo && prop.mapsTo in docs[0]) {
          ids[prop.name!] = docs[0][prop.mapsTo];
        }
      }
      convertFromDB(ids, this.config.timezone);
    }

    return ids;
  })();

  return resolveWithCallback(promise, cb);
};

Driver.prototype.hasMany = function (this: any, Model: any, association: any) {
  var db = this.db.collection(Model.table);
  var driver = this;

  return {
    has: function (Instance: any, Associations: any[], conditions: any, cb: (err: Error | null, result?: boolean) => void) {
      return db.find({
        _id : new mongodb.ObjectID(Instance[Model.id])
      }, [ association.name ]).toArray(function (err: Error | null, docs: any[]) {
        if (err) return cb(err);
        if (!docs.length) return cb(new Error("Not found"));
        if (!Array.isArray(docs[0][association.name])) return cb(null, false);
        if (!docs[0][association.name].length) return cb(null, false);

        var found: boolean;

        for (var i = 0; i < Associations.length; i++) {
          found = false;
          for (var j = 0; j < docs[0][association.name].length; j++) {
            if (docs[0][association.name][j]._id == Associations[i][association.model.id]) {
              found = true;
              break;
            }
          }
          if (!found) {
            return cb(null, false);
          }
        }

        return cb(null, true);
      });
    },
    get: function (Instance: any, conditions: any, options: any, createInstance: any, cb: (err: Error | null, docs?: any) => void) {
      return db.find({
        _id : new mongodb.ObjectID(Instance[Model.id])
      }, [ association.name ]).toArray(function (err: Error | null, docs: any[]) {
        if (err) return cb(err);
        if (!docs.length) return cb(new Error("Not found"));

        if (!docs[0][association.name]) {
          return cb(null, []);
        }

        var extra: any = {}
        conditions._id = { $in: [] };

        for (var i = 0; i < docs[0][association.name].length; i++) {
          conditions._id.$in.push(new mongodb.ObjectID(docs[0][association.name][i]._id));
          extra[docs[0][association.name][i]._id] = docs[0][association.name][i];
        }

        if (options.order) {
          options.order[0] = options.order[0][1];
        }

        return association.model.find(conditions, options, function (e: Error | null, docs: any[]) {
          var i: number, len: number;
          for (i = 0, len = docs.length; i < len; i++) {
            if (extra.hasOwnProperty(docs[i][association.model.id])) {
              docs[i].extra = extra[docs[i][association.model.id]];
            }
          }
          cb(e, docs);
        });
      });
    },
    add: function (Instance: any, Association: any, data: any, cb: (err: Error | null) => void) {
      var push: any = {};
      push[association.name] = { _id : Association[association.model.id] };

      for (var k in data) {
        push[association.name][k] = data[k];
      }

      return db.update({
        _id    : new mongodb.ObjectID(Instance[Model.id])
      }, {
        $push  : push
      }, {
        safe   : true,
        upsert : true
      }, cb);
    },
    del: function (Instance: any, Associations: any[], cb: (err: Error | null) => void) {
      if (Associations.length === 0) {
        var unset: any = {};
        unset[association.name] = 1;

        return db.update({
          _id    : new mongodb.ObjectID(Instance[Model.id])
        }, {
          $unset : unset
        }, {
          safe   : true,
          upsert : true
        }, cb);
      }

      var pull: any = {};
      pull[association.name] = [];

      for (var i = 0; i < Associations.length; i++) {
        var props: any = {_id: Associations[i][association.model.id]};

        if (Associations[i].extra !== undefined) {
          props = _.merge(props, _.pick(Associations[i].extra, _.keys(association.props)));
        }

        pull[association.name].push(props);
      }

      return db.update({
        _id      : new mongodb.ObjectID(Instance[Model.id])
      }, {
        $pullAll : pull
      }, {
        safe     : true,
        upsert   : true
      }, cb);
    }
  };
};

Driver.prototype.update = function (this: any, table: string, changes: any, conditions: any, cb?: (err: Error | null) => void): Promise<void> | void {
  const promise = new Promise<void>((resolve, reject) => {
    convertToDB(changes, this.config.timezone);
    convertToDB(conditions, this.config.timezone);

    this.db.collection(table).update(
      conditions,
      { $set: changes },
      { safe: true, upsert: true },
      (err: Error | null) => {
        if (err) return reject(err);
        resolve();
      }
    );
  });

  return resolveVoidWithCallback(promise, cb);
};

Driver.prototype.remove = function (this: any, table: string, conditions: any, cb?: (err: Error | null) => void): Promise<void> | void {
  const promise = new Promise<void>((resolve, reject) => {
    convertToDB(conditions, this.config.timezone);

    this.db.collection(table).remove(conditions, (err: Error | null) => {
      if (err) return reject(err);
      resolve();
    });
  });

  return resolveVoidWithCallback(promise, cb);
};

Driver.prototype.clear = function (this: any, table: string, cb?: (err: Error | null) => void): Promise<void> | void {
  const promise = new Promise<void>((resolve, reject) => {
    this.db.collection(table).remove((err: Error | null) => {
      if (err) return reject(err);
      resolve();
    });
  });

  return resolveVoidWithCallback(promise, cb);
};

function resolveConnectionString(config: any): string {
  if (config && typeof config.href === "string" && config.href.length > 0) {
    return config.href;
  }

  if (config && typeof config.__connectionUri === "string" && config.__connectionUri.length > 0) {
    return config.__connectionUri;
  }

  const authProvided = Boolean(config && config.__authProvided);
  const userProvided = Boolean(config && config.__userProvided);
  const passwordProvided = Boolean(config && config.__passwordProvided);

  let authPart = "";
  if (authProvided) {
    const rawUser = userProvided && typeof config.user === "string" ? config.user : "";
    const rawPassword = passwordProvided && typeof config.password === "string" ? config.password : "";

    if (passwordProvided) {
      const encodedUser = encodeURIComponent(rawUser || "");
      const encodedPassword = encodeURIComponent(rawPassword);
      authPart = `${encodedUser}:${encodedPassword}@`;
    } else if (userProvided && rawUser) {
      authPart = `${encodeURIComponent(rawUser)}@`;
    }
  }

  const host = config && typeof config.host === "string" && config.host.length > 0
    ? config.host
    : "localhost";
  const port = config && (typeof config.port === "string" || typeof config.port === "number")
    ? `:${config.port}`
    : "";
  const database = config && typeof config.database === "string" && config.database.length > 0
    ? config.database
    : "";
  const databasePart = database ? `/${database}` : "";

  let query = "";
  if (config && config.query && typeof config.query === "object") {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(config.query)) {
      if (value === undefined || value === null) continue;
      params.append(key, String(value));
    }
    const serialized = params.toString();
    if (serialized.length > 0) {
      query = `?${serialized}`;
    }
  }

  return `mongodb://${authPart}${host}${port}${databasePart}${query}`;
}

function convertToDB(obj: any, timeZone: string): void {
  for (var k in obj) {
    if ([ 'and', 'or', 'not' ].indexOf(k) >= 0) {
      for (var j = 0; j < obj[k].length; j++) {
        convertToDB(obj[k][j], timeZone);
      }
      obj['$' + k] = obj[k];
      delete obj[k];
      continue;
    }
    if (Array.isArray(obj[k]) && k[0] != '$') {
      for (var i = 0; i < obj[k].length; i++) {
        obj[k][i] = convertToDBVal(k, obj[k][i], timeZone);
      }

      obj[k] = { $in: obj[k] };
      continue;
    }

    obj[k] = convertToDBVal(k, obj[k], timeZone);
  }
}

function convertFromDB(obj: any, timezone: string): void {
  for (var k in obj) {
    if (obj[k] instanceof mongodb.ObjectID) {
      obj[k] = obj[k].toString();
      continue;
    }
    if (obj[k] instanceof mongodb.Binary) {
      obj[k] = (Buffer as any).from ? (Buffer as any).from(obj[k].value(), "binary") : new Buffer(obj[k].value(), "binary");
      continue;
    }
  }
}

function convertToDBVal(key: string, value: any, timezone: string): any {
  if (value && typeof value.sql_comparator == "function") {
    var val       = (key != "_id" ? value.val : new mongodb.ObjectID(value.val));
    var comp      = value.sql_comparator();
    var condition: any = {};

    switch (comp) {
      case "gt":
      case "gte":
      case "lt":
      case "lte":
      case "ne":
        condition["$" + comp] = val;
        break;
      case "eq":
        condition = val;
        break;
      case "between":
        condition["$min"] = value.from;
        condition["$max"] = value.to;
        break;
      case "like":
        condition["$regex"] = value.expr.replace("%", ".*");
        break;
    }

    return condition;
  }

  if (Buffer.isBuffer(value)) {
    return new mongodb.Binary(value);
  }

  if (key == "_id" && typeof value == "string") {
    value = new mongodb.ObjectID(value);
  }

  return value;
}

// ==================== IDriver Implementation ====================

/**
 * Get driver settings
 */
Driver.prototype.getSettings = function (this: any): DriverSettings {
  return {
    dataTypes: {},
    escapeId: (name: string) => name,
    escapeVal: (val: unknown) => String(val)
  };
};

/**
 * Define a model in the database
 */
Driver.prototype.define = function (this: any, definition: DriverDefineOptions): void {
  // TODO: Implement explicit model definition if needed
  // MongoDB is schemaless, so this is mostly a placeholder
};

/**
 * Get current database connection
 */
Driver.prototype.getConnection = function (this: any): unknown {
  return this.db;
};

Object.defineProperty(Driver.prototype, "isSql", {
    value: false
});
