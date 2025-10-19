/**
 * Chain Find - Fluent interface for querying
 */

import * as _ from 'lodash';
import * as async from 'async';
import { promisify } from 'util';
import * as Utilities from './Utilities';
import ChainInstance from './ChainInstance';
import { IDriver } from './types/Driver';
import {
  QueryConditions,
  PropertyDefinition,
  AssociationDefinition
} from './types/Core';
import type { Instance } from './types/Core';

export interface ChainFindOptions {
  table: string;
  driver: IDriver & { eagerQuery?: Function; config?: { protocol: string } };
  properties: Record<string, any>;
  keyProperties: PropertyDefinition[];
  keys: string[];
  newInstance: (data: Record<string, unknown>, cb: (err: Error | null, instance?: Instance) => void) => void;
  associations?: AssociationDefinition[];
  conditions?: QueryConditions & { __sql?: any[] };
  only?: string[];
  limit?: number;
  offset?: number;
  order?: Array<[string, string | any[]]>;
  merge?: Record<string, unknown>;
  exists?: Array<{
    table: string;
    link?: [string[], string[]];
    select?: string;
    where?: Record<string, unknown>;
    conditions?: Record<string, unknown>;
  }>;
  __eager?: AssociationDefinition[];
}

export function ChainFind(Model: any, opts: ChainFindOptions): any {
  const promiseFunctionPostfix = Model.settings.get('promiseFunctionPostfix');

  const prepareConditions = (): Record<string, any> => {
    return Utilities.transformPropertyNames(opts.conditions || {}, opts.properties);
  };

  const prepareOrder = (): any[] => {
    return Utilities.transformOrderPropertyNames((opts.order || []) as any, opts.properties);
  };

  const chainRun = (done: (err: Error | null, items?: any[]) => void): void => {
    const conditions = Utilities.transformPropertyNames(opts.conditions || {}, opts.properties);
    const order = Utilities.transformOrderPropertyNames((opts.order || []) as any, opts.properties);

    opts.driver.find(opts.only || [], opts.table, conditions, {
      limit: opts.limit,
      order: order as any,
      merge: opts.merge,
      offset: opts.offset,
      exists: opts.exists as any
    }, (err: Error | null, dataItems?: any) => {
      if (err) return done(err);
      if (dataItems.length === 0) return done(null, []);

      const eagerLoad = (err: Error | null, items: any[]): void => {
        const idMap: Record<string, number> = {};

        const keys = _.map(items, (item, index) => {
          const key = item[opts.keys[0]];
          for (const association of opts.__eager || []) {
            item[association.name] = [];
          }
          idMap[key] = index;
          return key;
        });

        async.eachSeries(opts.__eager || [],
          (association: any, cb: (err?: Error | null) => void) => {
            opts.driver.eagerQuery!(association, opts, keys, (err: Error | null, instances: any[]) => {
              if (err) return cb(err);

              for (const instance of instances) {
                items[idMap[instance.$p]][association.name].push(association.model(instance));
              }
              cb();
            });
          },
          (err?: Error | null) => {
            if (err) done(err);
            else done(null, items);
          }
        );
      };

      async.map(dataItems, opts.newInstance as any, (err: Error | null | undefined, items?: any[]) => {
        if (err) return done(err);

        const shouldEagerLoad = opts.__eager && opts.__eager.length;
        const completeFn = shouldEagerLoad ? eagerLoad : done;

        return completeFn(null, items || []);
      });
    });
  };

  const chain: any = {
    find(...args: any[]): any {
      let cb: Function | null = null;

      opts.conditions = opts.conditions || {};

      if (typeof _.last(args) === "function") {
        cb = args.pop();
      }

      if (typeof args[0] === "object") {
        _.extend(opts.conditions, args[0]);
      } else if (typeof args[0] === "string") {
        opts.conditions.__sql = opts.conditions.__sql || [];
        opts.conditions.__sql.push(args);
      }

      if (cb) {
        chainRun(cb as any);
      }
      return this;
    },

    only(...args: any[]): any {
      if (arguments.length && Array.isArray(arguments[0])) {
        opts.only = arguments[0];
      } else {
        opts.only = Array.prototype.slice.apply(arguments);
      }
      return this;
    },

    omit(...args: any[]): any {
      let omit: string[];

      if (arguments.length && Array.isArray(arguments[0])) {
        omit = arguments[0];
      } else {
        omit = Array.prototype.slice.apply(arguments);
      }
      this.only(_.difference(Object.keys(opts.properties), omit));
      return this;
    },

    limit(limit: number): any {
      opts.limit = limit;
      return this;
    },

    skip(offset: number): any {
      return this.offset(offset);
    },

    offset(offset: number): any {
      opts.offset = offset;
      return this;
    },

    order(property: string, order?: string): any {
      if (!Array.isArray(opts.order)) {
        opts.order = [];
      }
      if (property[0] === "-") {
        opts.order.push([property.substr(1), "Z"]);
      } else {
        opts.order.push([property, (order && order.toUpperCase() === "Z" ? "Z" : "A")]);
      }
      return this;
    },

    orderRaw(str: string, args?: any[]): any {
      if (!Array.isArray(opts.order)) {
        opts.order = [];
      }
      opts.order.push([str, args || []]);
      return this;
    },

    count(cb: (err: Error | null, count?: number) => void): any {
      (opts.driver.count as any)(opts.table, prepareConditions(), {
        merge: opts.merge
      }, (err: Error | null, data?: any[]) => {
        if (err || !data || data.length === 0) {
          return cb(err);
        }
        return cb(null, data[0].c);
      });
      return this;
    },

    remove(cb: (err: Error | null) => void): any {
      const keys = _.map(opts.keyProperties, 'mapsTo') as string[];

      opts.driver.find(keys, opts.table, prepareConditions(), {
        limit: opts.limit,
        order: prepareOrder() as any,
        merge: opts.merge,
        offset: opts.offset,
        exists: opts.exists as any
      }, (err: Error | null, data?: any[]) => {
        if (err) return cb(err);
        if (!data || data.length === 0) return cb(null);

        const conditions: any = { or: [] };

        for (let i = 0; i < data.length; i++) {
          const or: Record<string, unknown> = {};
          for (let j = 0; j < opts.keys.length; j++) {
            or[keys[j]] = data[i][keys[j]];
          }
          conditions.or.push(or);
        }

        return opts.driver.remove(opts.table, conditions, cb);
      });
      return this;
    },

    first(cb: (err: Error | null, item?: any) => void): any {
      return this.run((err: Error | null, items?: any[]) => {
        return cb(err, items && items.length > 0 ? items[0] : null);
      });
    },

    last(cb: (err: Error | null, item?: any) => void): any {
      return this.run((err: Error | null, items?: any[]) => {
        return cb(err, items && items.length > 0 ? items[items.length - 1] : null);
      });
    },

    each(cb?: Function): any {
      return new (ChainInstance as any)(this, cb);
    },

    run(cb: (err: Error | null, items?: any[]) => void): any {
      chainRun(cb);
      return this;
    },

    eager(...args: any[]): any {
      const associations = _.flatten(args);

      if (opts.driver.config?.protocol === "mongodb:") {
        throw new Error("MongoDB does not currently support eager loading");
      }

      opts.__eager = _.filter(opts.associations || [], (association: any) => {
        return ~associations.indexOf(association.name);
      }) as AssociationDefinition[];

      return this;
    }
  };

  chain.all = chain.where = chain.find;

  chain['find' + promiseFunctionPostfix] = promisify(chain.find);
  chain['all' + promiseFunctionPostfix] = promisify(chain.all);
  chain['where' + promiseFunctionPostfix] = promisify(chain.where);
  chain['first' + promiseFunctionPostfix] = promisify(chain.first);
  chain['last' + promiseFunctionPostfix] = promisify(chain.last);
  chain['run' + promiseFunctionPostfix] = promisify(chain.run);
  chain['remove' + promiseFunctionPostfix] = promisify(chain.remove);

  if (opts.associations) {
    for (const association of opts.associations) {
      addChainMethod(chain, association, opts);
    }
  }

  for (const k in Model) {
    if ([
      "hasOne", "hasMany",
      "drop", "sync", "get", "clear", "create",
      "exists", "settings", "aggregate"
    ].indexOf(k) >= 0) {
      continue;
    }
    if (typeof Model[k] !== "function" || chain[k]) {
      continue;
    }

    chain[k] = Model[k];
  }

  chain.model = Model;
  chain.options = opts;

  // Add promisified async methods
  if (promiseFunctionPostfix) {
    chain['find' + promiseFunctionPostfix] = promisify(chain.find);
    chain['all' + promiseFunctionPostfix] = promisify(chain.all);
    chain['where' + promiseFunctionPostfix] = promisify(chain.where);
    chain['first' + promiseFunctionPostfix] = promisify(chain.first);
    chain['last' + promiseFunctionPostfix] = promisify(chain.last);
    chain['run' + promiseFunctionPostfix] = promisify(chain.run);
    chain['remove' + promiseFunctionPostfix] = promisify(chain.remove);
  }

  return chain;
}

function addChainMethod(chain: any, association: any, opts: ChainFindOptions): void {
  chain[association.hasAccessor] = function (value: any): any {
    if (!opts.exists) {
      opts.exists = [];
    }

    const conditions: Record<string, any> = {};
    const assocIds = Object.keys(association.mergeAssocId);
    const ids = association.model.id;

    const mergeConditions = (source: any): void => {
      for (let i = 0; i < assocIds.length; i++) {
        if (typeof conditions[assocIds[i]] === "undefined") {
          conditions[assocIds[i]] = source[ids[i]];
        } else if (Array.isArray(conditions[assocIds[i]])) {
          conditions[assocIds[i]].push(source[ids[i]]);
        } else {
          conditions[assocIds[i]] = [conditions[assocIds[i]], source[ids[i]]];
        }
      }
    };

    if (Array.isArray(value)) {
      for (const v of value) {
        mergeConditions(v);
      }
    } else {
      mergeConditions(value);
    }

    opts.exists.push({
      table: association.mergeTable,
      link: [Object.keys(association.mergeId), association.model.id],
      conditions: conditions
    });

    return chain;
  };
}

export default ChainFind;
