/**
 * Chain Find - Fluent interface for querying (Promise-based)
 */

import * as _ from 'lodash';
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
  newInstance: (
    data: Record<string, unknown>,
    cb?: (err: Error | null, instance?: Instance) => void
  ) => Promise<Instance> | void;
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

  const ensureNoCallback = (method: string, args: any[]): void => {
    if (!args || args.length === 0) {
      return;
    }
    const lastArg = args[args.length - 1];
    if (typeof lastArg === 'function') {
      throw new Error(`${method} no longer accepts callback arguments. Use the returned promise instead.`);
    }
  };

  const resolveNewInstance = async (data: Record<string, unknown>): Promise<Instance> => {
    if (opts.newInstance.length >= 2) {
      return await new Promise<Instance>((resolve, reject) => {
        (opts.newInstance as any)(data, (err: Error | null, instance?: Instance) => {
          if (err) {
            return reject(err);
          }
          resolve(instance as Instance);
        });
      });
    }

    const result = (opts.newInstance as any)(data);
    if (result && typeof result.then === 'function') {
      return result;
    }

    throw new Error('newInstance must return a Promise when callbacks are removed.');
  };

  const prepareConditions = (): Record<string, any> => {
    return Utilities.transformPropertyNames(opts.conditions || {}, opts.properties);
  };

  const prepareOrder = (): any[] => {
    return Utilities.transformOrderPropertyNames((opts.order || []) as any, opts.properties);
  };

  const executeFind = async (
    fields: string[],
    tableName: string,
    conditions: Record<string, any>,
    options: Record<string, any>
  ): Promise<any[]> => {
    const driver: any = opts.driver;
    const rows = await driver.find(fields, tableName, conditions, options);
    return rows || [];
  };

  const executeCount = async (
    tableName: string,
    conditions: Record<string, any>,
    options: Record<string, any>
  ): Promise<number> => {
    const driver: any = opts.driver;
    const data = await driver.count(tableName, conditions, options);

    if (!data || data.length === 0) {
      return 0;
    }

    const row = data[0] as Record<string, any>;
    const value = row?.c ?? row?.count ?? row?.C ?? row?.COUNT;
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = parseInt(value, 10);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  };

  const executeRemove = async (
    tableName: string,
    conditions: Record<string, any>
  ): Promise<void> => {
    const driver: any = opts.driver;
    await driver.remove(tableName, conditions);
  };

  /**
   * Internal async chain execution
   * Retrieves instances with optional eager loading
   */
  const chainRun = async (): Promise<any[]> => {
    // Fetch raw data from driver
    const dataItems = await executeFind(
      opts.only || opts.keys,
      opts.table,
      prepareConditions(),
      {
        limit: opts.limit,
        order: prepareOrder() as any,
        merge: opts.merge,
        offset: opts.offset,
        exists: opts.exists as any
      }
    );

    if (!dataItems || dataItems.length === 0) {
      return [];
    }

    // Convert raw data to model instances
    const instances: any[] = [];
    for (const item of dataItems) {
      const instance = await resolveNewInstance(item);
      instances.push(instance);
    }

    // Handle eager loading associations
    if (opts.__eager && opts.__eager.length > 0 && typeof opts.driver.eagerQuery === 'function') {
      const idMap: Record<string, number> = {};
      const primaryKey = opts.keys[0];

      const keys = instances.map((instance, index) => {
        const key = instance[primaryKey];
        idMap[key] = index;
        return key;
      });

      for (const association of opts.__eager as any[]) {
        for (const instance of instances) {
          instance[association.name] = [];
        }

        const assocRows = await new Promise<any[]>((resolve, reject) => {
          try {
            const result = opts.driver.eagerQuery!(association, opts, keys, (err: Error | null, rows?: any[]) => {
              if (err) return reject(err);
              resolve(rows || []);
            });

            if (result && typeof result.then === 'function') {
              (result as Promise<any[]>).then(resolve).catch(reject);
            }
          } catch (err) {
            reject(err as Error);
          }
        });

        for (const row of assocRows) {
          const parentIndex = idMap[row.$p];
          if (typeof parentIndex === 'undefined') {
            continue;
          }
          const targetInstance = instances[parentIndex];
          const associatedInstance = new association.model(row);
          targetInstance[association.name].push(associatedInstance);
        }
      }
    }

    return instances;
  };

  const chain: any = {
    find(...args: any[]): any {
      ensureNoCallback('find', args);

      opts.conditions = opts.conditions || {};

      if (typeof args[0] === "object") {
        _.extend(opts.conditions, args[0]);
      } else if (typeof args[0] === "string") {
        opts.conditions.__sql = opts.conditions.__sql || [];
        opts.conditions.__sql.push(args);
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

    count(...args: any[]): Promise<number> {
      ensureNoCallback('count', args);
      return executeCount(
        opts.table,
        prepareConditions(),
        {
          merge: opts.merge,
          exists: opts.exists
        }
      );
    },

    remove(...args: any[]): Promise<void> {
      ensureNoCallback('remove', args);
      const keys = _.map(opts.keyProperties, 'mapsTo') as string[];

      const promise = executeFind(keys, opts.table, prepareConditions(), {
        limit: opts.limit,
        order: prepareOrder() as any,
        merge: opts.merge,
        offset: opts.offset,
        exists: opts.exists as any
      }).then((data: any[]) => {
        if (!data || data.length === 0) {
          return;
        }

        const conditions: any = { or: [] };

        for (let i = 0; i < data.length; i++) {
          const or: Record<string, unknown> = {};
          for (let j = 0; j < opts.keys.length; j++) {
            or[keys[j]] = data[i][keys[j]];
          }
          conditions.or.push(or);
        }

        return executeRemove(opts.table, conditions);
      });

      return promise as Promise<void>;
    },

    first(...args: any[]): Promise<any | null> {
      ensureNoCallback('first', args);
      return this.run().then((items: any[]) => {
        return items && items.length > 0 ? items[0] : null;
      });
    },

    last(...args: any[]): Promise<any | null> {
      ensureNoCallback('last', args);
      return this.run().then((items: any[]) => {
        return items && items.length > 0 ? items[items.length - 1] : null;
      });
    },

    each(cb?: (item: any, index: number, items: any[]) => void | Promise<void>): any {
      return ChainInstance(() => this.run(), cb);
    },

    run(...args: any[]): Promise<any[]> {
      ensureNoCallback('run', args);
      return chainRun();
    },

    eager(...args: any[]): any {
      const associations = _.flatten(args);

      opts.__eager = _.filter(opts.associations || [], (association: any) => {
        return ~associations.indexOf(association.name);
      }) as AssociationDefinition[];

      return this;
    }
  };

  chain.all = chain.where = chain.find;

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

  // Make ChainFind thenable - automatically call run() when awaited
  chain.then = function(onFulfilled?: (value: any[]) => any, onRejected?: (reason?: any) => any): Promise<any> {
    return chainRun().then(onFulfilled, onRejected);
  };

  chain.catch = function(onRejected?: (reason?: any) => any): Promise<any> {
    return chainRun().catch(onRejected);
  };

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
