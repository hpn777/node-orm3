import * as Utilities from "../../Utilities";
const mongodb = require("mongodb");
import * as _ from "lodash";
import { PropertyDefinition } from "../../types";

export { Driver };

function Driver(this: any, config: any, connection: any, opts: any) {
  this.client = new mongodb.MongoClient();
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

Driver.prototype.sync = function (this: any, opts: any, cb: (err: Error | null) => void) {
  this.db.createCollection(opts.table, function (err: Error | null, collection: any) {
    if (err) {
      return cb(err);
    }

    var indexes: string[] = [], pending: number;

    for (var i = 0; i < opts.one_associations.length; i++) {
      if (opts.one_associations[i].extension) continue;
      if (opts.one_associations[i].reversed) continue;

      for (var k in opts.one_associations[i].field) {
        indexes.push(k);
      }
    }

    for (i = 0; i < opts.many_associations.length; i++) {
      if (opts.many_associations[i].reversed) continue;

      indexes.push(opts.many_associations[i].name);
    }

    pending = indexes.length;

    for (i = 0; i < indexes.length; i++) {
      collection.createIndex(indexes[i], function () {
        if (--pending === 0) {
          return cb(null);
        }
      });
    }

    if (pending === 0) {
      return cb(null);
    }
  });
};

Driver.prototype.drop = function (this: any, opts: any, cb: (err?: Error | null) => void) {
  return this.db.collection(opts.table).drop(function () {
    if (typeof cb == "function") {
      return cb();
    }
  });
};

Driver.prototype.ping = function (this: any, cb: (err: Error | null) => void) {
  return process.nextTick(cb);
};

Driver.prototype.on = function (this: any, ev: string, cb: (err: Error) => void) {
  // if (ev == "error") {
  //   this.db.on("error", cb);
  //   this.db.on("unhandledError", cb);
  // }
  return this;
};

Driver.prototype.connect = function (this: any, cb: (err: Error | null) => void) {
  this.client.connect(this.config.href, function (this: any, err: Error | null, db: any) {
    if (err) {
      return cb(err);
    }

    this.db = db;

    return cb(null);
  }.bind(this));
};

Driver.prototype.close = function (this: any, cb?: (err: Error | null) => void) {
  if (this.db) {
    this.db.close();
  }
  if (typeof cb == "function") {
    cb(null);
  }
  return;
};

Driver.prototype.find = function (this: any, fields: string[] | null, table: string, conditions: any, opts: any, cb: (err: Error | null, docs?: any) => void) {
  var collection = this.db.collection(table);

  convertToDB(conditions, this.config.timezone);

  var cursor = (fields ? collection.find(conditions, fields) : collection.find(conditions));

  if (opts.order) {
    var orders: any[] = [];

    for (var i = 0; i < opts.order.length; i++) {
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

  return cursor.toArray(function (this: any, err: Error | null, docs: any[]) {
    if (err) {
      throw err;
      return cb(err);
    }

    var pending = 0;

    for (var i = 0; i < docs.length; i++) {
      convertFromDB(docs[i], this.config.timezone);
      if (opts.extra && opts.extra[docs[i]._id]) {
        docs[i] = _.merge(docs[i], _.omit(opts.extra[docs[i]._id], '_id'));
      }
      if (opts.createInstance) {
        pending += 1;

        docs[i] = opts.createInstance(docs[i], {
          extra : opts.extra_props
        }, function () {
          if (--pending === 0) {
            return cb(null, docs);
          }
        });
      }
    }

    if (pending === 0) {
      return cb(null, docs);
    }
  }.bind(this));
};

Driver.prototype.count = function (this: any, table: string, conditions: any, opts: any, cb: (err: Error | null, data?: any) => void) {
  var collection = this.db.collection(table);

  convertToDB(conditions, this.config.timezone);

  var cursor     = collection.find(conditions);

  if (opts.order) {
    var orders: any[] = [];

    for (var i = 0; i < opts.order.length; i++) {
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

  return cursor.count(true, function (err: Error | null, count: number) {
    if (err) return cb(err);

    return cb(null, [{ c : count }]);
  });
};

Driver.prototype.insert = function (this: any, table: string, data: any, keyProperties: PropertyDefinition[] | null, cb: (err: Error | null, ids?: any) => void) {
  convertToDB(data, this.config.timezone);

  return this.db.collection(table).insert(
    data,
    {
      w : 1
    },
    function (this: any, err: Error | null, docs: any[]) {
      if (err) return cb(err);

      var i: number, ids: any = {}, prop: PropertyDefinition;

      if (keyProperties && docs.length) {
        for (i = 0; i < keyProperties.length; i++) {
          prop = keyProperties[i];

          if (prop.mapsTo && prop.mapsTo in docs[0]) {
            ids[prop.name!] = docs[0][prop.mapsTo];
          }
        }
        convertFromDB(ids, this.config.timezone);
      }

      return cb(null, ids);
    }.bind(this)
  );
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

Driver.prototype.update = function (this: any, table: string, changes: any, conditions: any, cb: (err: Error | null) => void) {
  convertToDB(changes, this.config.timezone);
  convertToDB(conditions, this.config.timezone);

  return this.db.collection(table).update(
    conditions,
    {
      $set   : changes
    },
    {
      safe   : true,
      upsert : true
    },
    cb
  );
};

Driver.prototype.remove = function (this: any, table: string, conditions: any, cb: (err: Error | null) => void) {
  convertToDB(conditions, this.config.timezone);

  return this.db.collection(table).remove(conditions, cb);
};

Driver.prototype.clear = function (this: any, table: string, cb: (err: Error | null) => void) {
  return this.db.collection(table).remove(cb);
};

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

['ping', 'find', 'count', 'insert', 'update', 'remove', 'clear',].forEach(function (fnName: string) {
  (Driver.prototype as any)[fnName + 'Async'] = (Promise as any).promisify((Driver.prototype as any)[fnName]);
});

Object.defineProperty(Driver.prototype, "isSql", {
    value: false
});
