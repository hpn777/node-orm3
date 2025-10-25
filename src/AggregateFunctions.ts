const ORMError = require("./Error");
import * as Utilities from "./Utilities";

export = AggregateFunctions;

function AggregateFunctions(opts: any): any {
  if (typeof opts.driver.getQuery !== "function") {
    throw new ORMError('NO_SUPPORT', "This driver does not support aggregate functions");
  }
  if (!Array.isArray(opts.driver.aggregate_functions)) {
    throw new ORMError('NO_SUPPORT', "This driver does not support aggregate functions");
  }

  var aggregates: any[]    = [ [] ];
  var group_by: any      = null;
  var used_distinct: boolean = false;

  var appendFunction = function (fun: string) {
    return function () {
      var args = (arguments.length && Array.isArray(arguments[0]) ? arguments[0] : Array.prototype.slice.apply(arguments));

      if (args.length > 0) {
        aggregates[aggregates.length - 1].push({ f: fun, a: args, alias: aggregateAlias(fun, args) });
        aggregates.push([]);
      } else {
        aggregates[aggregates.length - 1].push({ f: fun, alias: aggregateAlias(fun, args) });
      }

      if (fun === "distinct") {
        used_distinct = true;
      }

      return proto;
    };
  };
  var proto: any = {
    groupBy: function () {
      group_by = Array.prototype.slice.apply(arguments);
      return this;
    },
    limit: function (offset: number, limit?: number) {
      if (typeof limit === "number") {
        opts.limit = [ offset, limit ];
      } else {
        opts.limit = [ 0, offset ]; // offset = limit
      }
      return this;
    },
    order: function () {
      opts.order = Utilities.standardizeOrder(Array.prototype.slice.apply(arguments));
      return this;
    },
    select: function () {
      if (arguments.length === 0) {
        throw new ORMError('PARAM_MISMATCH', "When using append you must at least define one property");
      }
      if (Array.isArray(arguments[0])) {
        opts.propertyList = opts.propertyList.concat(arguments[0]);
      } else {
        opts.propertyList = opts.propertyList.concat(Array.prototype.slice.apply(arguments));
      }
      return this;
    },
    as: function (alias: string) {
      if (aggregates.length === 0 || (aggregates.length === 1 && aggregates[0].length === 0)) {
        throw new ORMError('PARAM_MISMATCH', "No aggregate functions defined yet");
      }

      var len = aggregates.length;

      aggregates[len - 1][aggregates[len - 1].length - 1].alias = alias;

      return this;
    },
    call: function (fun: string, args?: any[]) {
      if (args && args.length > 0) {
        aggregates[aggregates.length - 1].push({ f: fun, a: args, alias: aggregateAlias(fun, args) });
        // aggregates.push([]);
      } else {
        aggregates[aggregates.length - 1].push({ f: fun, alias: aggregateAlias(fun, args) });
      }

      if (fun.toLowerCase() === "distinct") {
        used_distinct = true;
      }

      return this;
    },
    get: function (cb?: (err: Error | null, ...args: any[]) => void) {
      const execute = async (): Promise<any[]> => {
        if (aggregates[aggregates.length - 1].length === 0) {
          aggregates.length -= 1;
        }
        if (aggregates.length === 0) {
          throw new ORMError('PARAM_MISMATCH', "Missing aggregate functions");
        }

        let query = opts.driver.getQuery().select().from(opts.table).select(opts.propertyList);

        for (let i = 0; i < aggregates.length; i++) {
          for (let j = 0; j < aggregates[i].length; j++) {
            query.fun(aggregates[i][j].f, aggregates[i][j].a, aggregates[i][j].alias);
          }
        }

        query.where(opts.conditions);

        if (group_by !== null) {
          query.groupBy.apply(query, group_by);
        }

        if (opts.order) {
          for (let i = 0; i < opts.order.length; i++) {
            query.order(opts.order[i][0], opts.order[i][1]);
          }
        }
        if (opts.limit) {
          query.offset(opts.limit[0]).limit(opts.limit[1]);
        }

        query = query.build();

        const data = await new Promise<any[]>((resolve, reject) => {
          opts.driver.execQuery(query, function (err: Error | null, rows: any[]) {
            if (err) {
              reject(err);
            } else {
              resolve(rows);
            }
          });
        });

        if (group_by !== null) {
          return [data];
        }

        if (used_distinct && aggregates.length === 1) {
          const columnKey = data.length > 0 ? Object.keys(data[0] || {}).pop()! : undefined;
          const items = data.map(item => (columnKey ? item[columnKey] : undefined));
          return [items];
        }

        const items: any[] = [];
        const row = data[0] || {};

        for (let i = 0; i < aggregates.length; i++) {
          for (let j = 0; j < aggregates[i].length; j++) {
            items.push(row[aggregates[i][j].alias] ?? null);
          }
        }

        return items;
      };

      if (typeof cb === 'function') {
        execute()
          .then((values) => cb(null, ...values))
          .catch((err) => cb(err));
        return;
      }

      return execute();
    }
  };

  for (var i = 0; i < opts.driver.aggregate_functions.length; i++) {
    addAggregate(proto, opts.driver.aggregate_functions[i], appendFunction);
  }

  return proto;
}

function addAggregate(proto: any, fun: string | string[], builder: (fun: string) => any): void {
  if (Array.isArray(fun)) {
    proto[fun[0].toLowerCase()] = builder((fun[1] || fun[0]).toLowerCase());
  } else {
    proto[fun.toLowerCase()] = builder(fun.toLowerCase());
  }
}

function aggregateAlias(fun: string, fields?: any[]): string {
  return fun + (fields && fields.length ? "_" + fields.join("_") : "");
}
