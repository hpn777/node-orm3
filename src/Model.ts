import _ from 'lodash';
import async from 'async';
import { promisify } from './utils/promises';
import ChainFind from './ChainFind';
import { Instance } from './Instance';
import LazyLoad from './LazyLoad';
import ORMError from './Error';
import * as OneAssociation from './Associations/One';
import * as ManyAssociation from './Associations/Many';
import * as ExtendAssociation from './Associations/Extend';
import Property from './Property';
import * as Hook from './Hook';
import * as Utilities from './Utilities';
import Validators from './Validators';
import Singleton from './Singleton';
import {
  ModelOptions,
  InstanceData,
  PropertyDefinition,
  Model as ModelType,
  Instance as InstanceType,
  AssociationDefinition,
  HookCallback,
  SettingsContainer,
  QueryConditions,
  FindOptions,
  AggregateOptions
} from './types/Core';
import type { HookMap } from './types/Core';

const AvailableHooks = [
  "beforeCreate",
  "afterCreate",
  "beforeSave",
  "afterSave",
  "beforeValidation",
  "beforeRemove",
  "afterRemove",
  "afterLoad",
  "afterAutoFetch"
];

interface CreateInstanceOptions {
  uid?: string;
  autoSave?: boolean;
  autoFetch?: boolean;
  autoFetchLimit?: number;
  cascadeRemove?: boolean;
  is_new?: boolean;
  extra?: any[];
  extra_info?: any;
}

export default function Model(opts: ModelOptions): ModelType {
  const one_associations: AssociationDefinition[] = [];
  const many_associations: AssociationDefinition[] = [];
  const extend_associations: AssociationDefinition[] = [];
  const association_properties: string[] = [];
  const model_fields: any[] = [];
  const fieldToPropertyMap: { [key: string]: PropertyDefinition } = {};
  const allProperties: { [key: string]: PropertyDefinition } = {};
  const keyProperties: PropertyDefinition[] = [];

  const modelHooks: Record<string, any> = {};

  // Initialize hooks from options
  if (opts.hooks) {
    for (const hook in opts.hooks) {
      if (opts.hooks.hasOwnProperty(hook)) {
  const hookFn = (opts.hooks as any)[hook];
        if (typeof hookFn === 'function') {
          modelHooks[hook] = hookFn;
        }
      }
    }
  }

  const createHookHelper = function (hook: string): Function {
  return function (this: any, cb: any): ModelType {
      modelHooks[hook] = cb;
      return this;
    };
  };

  const createInstance = function (
    data: InstanceData,
    instanceOpts: CreateInstanceOptions,
    cb: (err: Error | null, instance?: InstanceType) => void
  ): void {
    instanceOpts = instanceOpts || {};

    const prepareInstance = (instance: InstanceType): void => {
      // Hook execution is handled by Instance.ts saveInstance/waitHooks
      // No need to register event handlers here
      
      Hook.wait(instance, modelHooks.afterLoad, (err?: Error) => {
        if (err) {
          return cb(err);
        }

        if (instanceOpts.extra) {
          for (let i = 0; i < instanceOpts.extra.length; i++) {
            if (!instanceOpts.extra[i].hasOwnProperty("extra")) {
              continue;
            }

            for (const k in instanceOpts.extra[i].extra) {
              (instance as any)[k] = instanceOpts.extra[i].extra[k];
            }
          }
        }

        if (instanceOpts.extra_info) {
          (instance as any).extra = instanceOpts.extra_info;
        }

        cb(null, instance);
      });
    };

    const saveNewInstance = (instance: InstanceType, saveCb: Function): void => {
      // Call instance.save directly - let it handle hooks
      (instance.save({}) as Promise<void>).then(() => {
        return saveCb(null, instance);
      }).catch((err: Error) => {
        return cb(err);
      });
    };

    const instance = Instance(model, {
      uid: instanceOpts.uid || undefined,
  data: data,
  autoSave: instanceOpts.autoSave,
  autoFetch: instanceOpts.autoFetch,
  autoFetchLimit: instanceOpts.autoFetchLimit,
  cascadeRemove: instanceOpts.cascadeRemove,
      extra: instanceOpts.extra,
      extra_info: instanceOpts.extra_info,
      driver: opts.driver,
      table: opts.table!,
      keys: opts.keys!,
      changes: (instanceOpts.is_new ? Object.keys(data) : []),
      validations: opts.validations || {},
      one_associations: one_associations,
      many_associations: many_associations,
      keyProperties: keyProperties,
      is_new: instanceOpts.is_new === true,
      setupAssociations: setupAssociations,
      hooks: modelHooks,
      methods: opts.methods || {}
  }) as any;

    const runAutoFetchAndPrepare = (): void => {
      const associationOptions = {
        autoFetch: instanceOpts.autoFetch,
        autoFetchLimit: instanceOpts.autoFetchLimit,
        cascadeRemove: instanceOpts.cascadeRemove
      };

      OneAssociation.autoFetch(instance, one_associations as any, associationOptions, () => {
        ManyAssociation.autoFetch(instance, many_associations as any, associationOptions, () => {
          ExtendAssociation.autoFetch(instance, extend_associations as any, associationOptions, () => {
            Hook.wait(instance as any, modelHooks.afterAutoFetch, (err?: Error) => {
              if (err) {
                return cb(err);
              }
              prepareInstance(instance);
            });
          });
        });
      });
    };

    if (instanceOpts.is_new && opts.autoSave) {
      return saveNewInstance(instance, function (err: Error | null, inst?: InstanceType) {
        if (err) {
          return cb(err);
        }
        runAutoFetchAndPrepare();
      });
    }

    runAutoFetchAndPrepare();
  };

  const setupAssociations = (instance: any, inst_opts?: any): void => {
    const assoc_opts = {
      autoFetch: inst_opts?.autoFetch || false,
      autoFetchLimit: inst_opts?.autoFetchLimit,
      cascadeRemove: inst_opts?.cascadeRemove
    };

  OneAssociation.extend(model as any, instance as any, opts.driver, one_associations as any);
  ManyAssociation.extend(model as any, instance as any, opts.driver, many_associations as any, assoc_opts, createInstance);
  ExtendAssociation.extend(model as any, instance as any, opts.driver, extend_associations as any, assoc_opts);
    
    if (opts.properties) {
  LazyLoad.extend(instance as any, model as any, opts.properties);
    }

    if (opts.instanceMethods) {
      for (const m in opts.instanceMethods) {
        if (!instance.hasOwnProperty(m)) {
          instance[m] = opts.instanceMethods[m];
        }
      }
    }
  };

  const model: any = function (this: any, ...args: any[]): any {
    // Check if called with 'new'
    if (this && this.constructor === model) {
      const data = args[0] || {};
      const instance = Instance(model, {
        uid: undefined,
        data: data,
        autoSave: opts.autoSave,
        autoFetch: opts.autoFetch,
        autoFetchLimit: opts.autoFetchLimit,
        cascadeRemove: opts.cascadeRemove,
        extra: undefined,
        extra_info: undefined,
        driver: opts.driver,
        table: opts.table!,
        keys: opts.keys!,
        changes: Object.keys(data),
        validations: opts.validations || {},
        one_associations: one_associations,
        many_associations: many_associations,
        keyProperties: keyProperties,
        is_new: true,
        setupAssociations: setupAssociations,
        hooks: modelHooks,
        methods: opts.methods || {}
      }) as any;
      return instance;
    }

    const cb = (typeof args[args.length - 1] === "function" ? args.pop() : null);

    if (args.length === 0) {
      createInstance({}, {}, function (err, instance) {
        if (cb) cb(err, instance);
      });
      return model;
    }

    if (typeof args[0] === "object" && !Array.isArray(args[0])) {
      return model.find(args[0], cb);
    }

    // If we have a callback, call model.get to fetch from database
    if (cb) {
      return model.get.apply(model, args.concat([cb]));
    }

    // If no callback, create a shell instance with the provided key
  const shellData: Record<string, any> = {};
    const keyFieldNames = opts.keys || [];
    
    for (let i = 0; i < keyFieldNames.length && i < args.length; i++) {
      shellData[keyFieldNames[i]] = args[i];
    }
    
    // Create shell instance synchronously
    const instance = Instance(model, {
      uid: undefined,
      data: shellData,
      autoSave: false,
      autoFetch: undefined,
      autoFetchLimit: undefined,
      cascadeRemove: undefined,
      extra: undefined,
      extra_info: undefined,
      driver: opts.driver,
      table: opts.table!,
      keys: opts.keys!,
      changes: [],
      validations: opts.validations || {},
      one_associations: one_associations,
      many_associations: many_associations,
      keyProperties: keyProperties,
      is_new: false,
      isShell: true,
      setupAssociations: setupAssociations,
      hooks: modelHooks,
      methods: {}
  }) as any;
    
    return instance;
  };

  // Set model.settings early so Instance() can access it
  Object.defineProperty(model, "settings", {
    value: opts.settings,
    enumerable: false
  });
  Object.defineProperty(model, "table", {
    value: opts.table,
    enumerable: false
  });

  const invokeLegacyCallback = <T>(callback: ((err: Error | null, result?: T) => void) | null | undefined, err: Error | null, result?: T): Error | null => {
    if (typeof callback !== "function") {
      return null;
    }

    try {
      callback(err, result);
      return null;
    } catch (cbErr) {
      return cbErr as Error;
    }
  };

  const resolveWithCallback = <T>(promise: Promise<T>, callback?: ((err: Error | null, result?: T) => void) | null): Promise<T> => {
    if (typeof callback !== "function") {
      return promise;
    }

    return promise
      .then((result) => {
        const cbErr = invokeLegacyCallback<T>(callback, null, result);
        if (cbErr) {
          return Promise.reject(cbErr);
        }
        return result;
      })
      .catch((err) => {
        const cbErr = invokeLegacyCallback<T>(callback, err as Error, undefined);
        if (cbErr) {
          return Promise.reject(cbErr);
        }
        return Promise.reject(err);
      });
  };

  // Internal callback-based drop implementation
  const _dropCallback = function (this: any, cb: (err?: Error | null) => void): ModelType {
    opts.driver.drop({
      table: opts.table,
      properties: allProperties,
      one_associations: one_associations,
      many_associations: many_associations
    }, cb);

    return this;
  };

  // Public async-only interface
  model.drop = function (cb?: (err?: Error | null) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      _dropCallback.call(model, (err?: Error | null) => {
        if (typeof cb === "function") {
          try {
            cb(err || undefined);
          } catch (cbErr) {
            reject(cbErr as Error);
            return;
          }
        }

        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  };

  // Internal callback-based sync implementation
  const _syncCallback = function (this: any, cb: (err?: Error | null) => void): ModelType {
    opts.driver.sync({
      id: keyProperties.map(p => p.name),
      extension: opts.extension,
      table: opts.table,
      allProperties: allProperties,
      one_associations: one_associations,
      many_associations: many_associations,
      extend_associations: extend_associations
    }, cb);

    return this;
  };

  // Public async-only interface
  model.sync = function (cb?: (err?: Error | null) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      _syncCallback.call(model, (err?: Error | null) => {
        if (typeof cb === "function") {
          try {
            cb(err || undefined);
          } catch (cbErr) {
            reject(cbErr as Error);
            return;
          }
        }

        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  };

  model.get = function (...params: any[]): Promise<InstanceType | null> {
    const callback = (params.length > 0 && typeof params[params.length - 1] === "function")
      ? (params.pop() as (err: Error | null, item?: InstanceType | null) => void)
      : undefined;

    const conditions: QueryConditions = {};
    const options: any = {};
    const keys = Array.isArray(opts.keys) ? opts.keys : [opts.keys!];

    let ids: any[] = params;

    if (ids.length > 0 && typeof ids[ids.length - 1] === "object" && !Array.isArray(ids[ids.length - 1])) {
      const lastArg = ids[ids.length - 1];
      const hasIdFields = keys.some((k: string) => Object.prototype.hasOwnProperty.call(lastArg, k));
      if (!hasIdFields && ids.length > 1) {
        const optsArg = ids.pop()!;
        for (const k in optsArg) {
          options[k] = optsArg[k];
        }
      }
    }

    if (ids.length === 1 && typeof ids[0] === "object" && !Array.isArray(ids[0])) {
      options.identityCache = ids[0].identityCache;
      delete ids[0].identityCache;

      for (const k in ids[0]) {
        if (keys.indexOf(k) !== -1) {
          conditions[k] = ids[0][k];
        } else {
          options[k] = ids[0][k];
        }
      }
    } else {
      if (keys.length === 1 && Array.isArray(ids[0])) {
        ids = ids[0];
      }

      if (ids.length !== keys.length) {
        throw new ORMError("Model.get() IDs missing", 'MISSING_CALLBACK', { model: opts.table });
      }

      for (let i = 0; i < keys.length; i++) {
        conditions[keys[i]] = ids[i];
      }
    }

    options.identityCache = options.hasOwnProperty("identityCache") ? options.identityCache : opts.settings!.get("instance.identityCache");

    const promise = new Promise<InstanceType | null>((resolve, reject) => {
      const uid = opts.driver.uid + "/" + opts.table + "/";
      const itemId = uid + keys.map((k: string) => conditions[k]).join("/");

      if (options.identityCache === false) {
        return model.find(conditions, options).run().then((items: InstanceType[]) => {
          if (!items || items.length === 0) {
            return reject(new ORMError("Not found", 'NOT_FOUND', { model: opts.table }));
          }
          resolve(items[0]);
        }).catch(reject);
      }

      Singleton.get(itemId, {
        identityCache: options.identityCache,
        saveCheck: opts.settings!.get("instance.identityCacheSaveCheck")
      }, function (createCb: Function) {
        model.find(conditions, options).run().then((items: InstanceType[]) => {
          if (!items || items.length === 0) {
            return createCb(new ORMError("Not found", 'NOT_FOUND', { model: opts.table }));
          }
          return createCb(null, items[0]);
        }).catch(createCb);
      }, function(err: Error | null, item?: InstanceType) {
        if (err) reject(err);
        else resolve(item || null);
      });
    });

    return resolveWithCallback(promise, callback);
  };

  model.find = function (...args: any[]): any {
    const conditions: QueryConditions = {};
    let options: FindOptions = {};
    let limit: number | undefined = undefined;
    let order: any[] = [];
    let merge: any = null;
    let cb: Function | null = null;
    const optionKeys = new Set([
      "limit",
      "order",
      "offset",
      "merge",
      "exists",
      "identityCache",
      "autoFetch",
      "autoFetchLimit",
      "cascadeRemove",
      "__merge",
      "extra",
      "extra_info",
      "only",
      "fields"
    ]);
    const conditionSpecialKeys = new Set([
      "or",
      "and",
      "not",
      "not_or",
      "not_and",
      "exists",
      "like",
      "like_i"
    ]);
    const looksLikeOptions = (obj: Record<string, any>): boolean => {
      const keys = Object.keys(obj);
      if (keys.length === 0) return false;
      for (const key of keys) {
        if (optionKeys.has(key)) {
          if ((key === "order" || key === "limit" || key === "offset") && allProperties.hasOwnProperty(key)) {
            continue;
          }
          return true;
        }
      }
      return false;
    };
    const looksLikeConditions = (obj: Record<string, any>): boolean => {
      const keys = Object.keys(obj);
      if (keys.length === 0) return true;
      return keys.every((key) => allProperties.hasOwnProperty(key) || conditionSpecialKeys.has(key));
    };
    const appendOrder = (value: any): void => {
      if (!value) return;

      if (typeof value === "string") {
        const standardized = Utilities.standardizeOrder(value);
        for (const entry of standardized) {
          order.push(entry as any);
        }
        return;
      }

      if (!Array.isArray(value) || value.length === 0) {
        return;
      }

      const first = value[0];
      const second = value.length > 1 ? value[1] : undefined;
      const isDirectionToken = typeof second === "string" && second.length > 0 && ["A", "Z"].indexOf(second.toUpperCase()) >= 0;

      if (Array.isArray(first) && isDirectionToken && !Array.isArray(second)) {
        order.push([first, (second as string).toUpperCase()]);
        return;
      }

      if (Array.isArray(first) && value.length === 1) {
        order.push([first, "A"]);
        return;
      }

      if (typeof first === "string") {
        const standardized = Utilities.standardizeOrder(value as any);
        for (const entry of standardized) {
          order.push(entry as any);
        }
        return;
      }

      for (const item of value) {
        appendOrder(item);
      }
    };

    let hasConditionObject = false;
    let hasOptionsObject = false;

    for (let i = 0; i < args.length; i++) {
      switch (typeof args[i]) {
        case "number":
          limit = args[i];
          break;
        case "object":
          if (Array.isArray(args[i])) {
            const arrayArg = args[i];
            const firstElement = arrayArg[0];
            const isOrderArray = typeof firstElement === "string" || Array.isArray(firstElement);
            if (arrayArg.length > 0 && isOrderArray) {
              appendOrder(arrayArg);
            } else {
              merge = {
                from: arrayArg[0],
                to: arrayArg[1],
                select: arrayArg[2]
              };
            }
          } else {
            const objectArg = args[i] || {};
            const treatAsOptions = looksLikeOptions(objectArg) || (hasConditionObject && !looksLikeConditions(objectArg));
            if (!hasConditionObject || (!treatAsOptions && !hasOptionsObject)) {
              _.extend(conditions, objectArg);
              hasConditionObject = true;
            } else {
              _.extend(options, objectArg);
              hasOptionsObject = true;
            }
          }
          break;
        case "function":
          cb = args[i];
          break;
        case "string":
          if (args[i][0] === "-") {
            order.push([args[i].substr(1), "Z"]);
          } else {
            order.push([args[i], "A"]);
          }
          break;
      }
    }

    if (order.length === 0) {
      order = opts.order ? opts.order : [];
    }

    options = _.defaults(options, {
      identityCache: opts.settings!.get("instance.identityCache"),
      autoFetch: opts.autoFetch,
      autoFetchLimit: opts.autoFetchLimit,
      cascadeRemove: opts.settings!.get("instance.cascadeRemove")
    });

    if ((options as any).order) {
      // Options order should replace any previously defined order
      order = [];
      appendOrder((options as any).order);
      delete (options as any).order;
    }

    if (!merge && (options as any).__merge) {
      merge = (options as any).__merge;
    }
    if ((options as any).__merge) {
      delete (options as any).__merge;
    }

    if (limit !== undefined) {
      options.limit = limit;
    }

    if (typeof options.extra === "undefined") {
      options.extra = [];
    } else if (!Array.isArray(options.extra)) {
      options.extra = [options.extra];
    }

    if (typeof options.extra_info === "undefined") {
      options.extra_info = {};
    }

    if (merge) {
      options.extra.push(merge.from);
      options.merge = merge;

      if (typeof merge.select !== "undefined") {
        for (const k in merge.select) {
          options.extra_info[k] = true;
        }
      }
    }

    let checkConditions = Utilities.checkConditions(conditions, one_associations as any);

    const chain = ChainFind(model, {
      only: model_fields,
      keys: Array.isArray(opts.keys) ? opts.keys : [opts.keys!],
      table: opts.table!,
      driver: opts.driver,
      conditions: checkConditions,
      associations: many_associations,
      limit: options.limit,
      order: order,
      merge: merge,
      offset: options.offset,
      properties: allProperties,
      keyProperties: keyProperties,
      newInstance: function (data: InstanceData, cb: (err: Error | null, instance?: InstanceType) => void) {
        Utilities.renameDatastoreFieldsToPropertyNames(data, fieldToPropertyMap as any);

        const keys = Array.isArray(opts.keys) ? opts.keys : [opts.keys!];
        let uid = opts.driver.uid + "/" + opts.table + (merge ? "+" + merge.from.table : "");
        for (let i = 0; i < keys.length; i++) {
          uid += "/" + data[keys[i]];
        }

        // Extract merge table extra columns from the data
        let extra_info_with_values = options.extra_info;
        if (merge && merge.select && merge.selectMap && Array.isArray(merge.select) && merge.select.length > 0) {
          extra_info_with_values = Object.assign({}, options.extra_info);
          // merge.selectMap is a map of propertyName -> columnName
          // merge.props contains the property definitions for type conversion
          for (const propName in merge.selectMap) {
            const columnName = merge.selectMap[propName];
            if (columnName in data) {
              let value = data[columnName];
              
              // Convert the value using the property definition if available
              if (merge.props && propName in merge.props && opts.driver.valueToProperty) {
                const propDef = merge.props[propName];
                value = opts.driver.valueToProperty(value, propDef);
              }
              
              extra_info_with_values[propName] = value;
              // Remove the merge column from data so it doesn't become part of the instance
              delete data[columnName];
            }
          }
        }

        Singleton.get(uid, {
          identityCache: options.identityCache,
          saveCheck: opts.settings!.get("instance.identityCacheSaveCheck")
        }, function (createCb: Function) {
          return createInstance(data, {
            uid: uid,
            autoSave: opts.autoSave,
            autoFetch: (options.autoFetchLimit === 0 ? false : (options.autoFetch || opts.autoFetch)),
            autoFetchLimit: options.autoFetchLimit,
            cascadeRemove: options.cascadeRemove,
            extra: options.extra,
            extra_info: extra_info_with_values
          }, createCb as any);
        }, cb as any);
      }
    });

    return chain;
  };

  model.where = model.all = model.find;


  // Public async-one method with legacy callback support
  model.one = function (...args: any[]): Promise<InstanceType | null> {
    const callback = (args.length > 0 && typeof args[args.length - 1] === "function")
      ? (args.pop() as (err: Error | null, item?: InstanceType | null) => void)
      : undefined;

    let conditions: Record<string, unknown> = {};
    let options: FindOptions | undefined;

    if (args.length > 0 && typeof args[0] === "object" && !Array.isArray(args[0])) {
      conditions = args.shift() || {};
    }

    if (args.length > 0 && typeof args[0] === "object" && !Array.isArray(args[0])) {
      options = args.shift();
    }

    const promise = new Promise<InstanceType | null>((resolve, reject) => {
      (async () => {
        try {
          const chain = model.find(conditions, options) as any;
          chain.limit(1);
          const results = await chain.run();
          resolve(results && results.length ? results[0] : null);
        } catch (err) {
          reject(err);
        }
      })();
    });

    return resolveWithCallback(promise, callback);
  };

  // Public async-only count method with callback support
  model.count = function (...args: any[]): Promise<number> {
    const callback = (args.length > 0 && typeof args[args.length - 1] === "function")
      ? (args.pop() as (err: Error | null, count?: number) => void)
      : undefined;

    let conditions: Record<string, unknown> | undefined = undefined;
    if (args.length > 0 && typeof args[0] === "object" && !Array.isArray(args[0])) {
      conditions = args.shift();
    }

    const promise = new Promise<number>((resolve, reject) => {
      let checkConditions = conditions;

      if (conditions) {
        checkConditions = Utilities.checkConditions(conditions, one_associations as any);
      }

      opts.driver.count(opts.table, checkConditions || {}, {}, function (err: Error | null, data?: any[]) {
        if (err || !data || data.length === 0) {
          return reject(err || new Error("Count failed"));
        }
        return resolve(data[0].c);
      });
    });

    return resolveWithCallback(promise, callback);
  };

  model.aggregate = function (...args: any[]): any {
    let conditions: QueryConditions = {};
    let propertyList: string[] = [];

    for (let i = 0; i < args.length; i++) {
      if (typeof args[i] === "object") {
        if (Array.isArray(args[i])) {
          propertyList = args[i];
        } else {
          conditions = args[i];
        }
      }
    }

    if (conditions) {
      conditions = Utilities.checkConditions(conditions, one_associations as any);
    }

    return new (require("./AggregateFunctions"))({
      table: opts.table,
      driver_name: opts.driver_name,
      driver: opts.driver,
      conditions: conditions,
      propertyList: propertyList,
      properties: allProperties
    });
  };

  // Public async-only exists method
  model.exists = function (...ids: any[]): Promise<boolean> {
    const callback = (ids.length > 0 && typeof ids[ids.length - 1] === "function")
      ? (ids.pop() as (err: Error | null, exists?: boolean) => void)
      : undefined;

    const promise = new Promise<boolean>((resolve, reject) => {
      let conditions: QueryConditions = {};
      let i: number;
      const keys = Array.isArray(opts.keys) ? opts.keys : [opts.keys!];

      if (ids.length === 1 && typeof ids[0] === "object") {
        if (Array.isArray(ids[0])) {
          for (i = 0; i < keys.length; i++) {
            conditions[keys[i]] = ids[0][i];
          }
        } else {
          conditions = ids[0];
        }
      } else {
        for (i = 0; i < keys.length; i++) {
          conditions[keys[i]] = ids[i];
        }
      }

      if (conditions) {
        conditions = Utilities.checkConditions(conditions, one_associations as any);
      }

      (opts.driver.count as any)(opts.table, conditions, {}, function (err: Error | null, data?: any[]) {
        if (err || !data || data.length === 0) {
          return reject(err);
        }
        return resolve(data[0].c > 0);
      });
    });

    return resolveWithCallback(promise, callback);
  };

  model.create = function (...args: any[]): Promise<InstanceType | InstanceType[]> {
    const params = Array.from(args);
    const callback = (params.length > 0 && typeof params[params.length - 1] === "function")
      ? (params.pop() as (err: Error | null, result?: InstanceType | InstanceType[]) => void)
      : undefined;

    let itemsParams: any[] = [];
    let options: any = {};
    let single = false;

    for (let i = 0; i < params.length; i++) {
      switch (typeof params[i]) {
        case "object":
          if (!single && Array.isArray(params[i])) {
            itemsParams = itemsParams.concat(params[i]);
          } else if (i === 0) {
            single = true;
            itemsParams.push(params[i]);
          } else {
            options = params[i];
          }
          break;
      }
    }

    const promise = (async () => {
      const items: InstanceType[] = [];

      for (let i = 0; i < itemsParams.length; i++) {
        const itemParams = itemsParams[i];
        
        // Create instance without autoSave
        const item = await new Promise<InstanceType>((resolve, reject) => {
          createInstance(itemParams, {
            is_new: true,
            autoSave: false,
            autoFetch: false
          }, (err, inst) => {
            if (err) reject(err);
            else resolve(inst!);
          });
        });
        
        // Manually save
        try {
          await (item.save({}, options) as Promise<void>);
          items.push(item);
        } catch (err) {
          throw err;
        }
      }

      return single ? items[0] : items;
    })();

    return resolveWithCallback(promise, callback);
  };

  // Internal callback-based implementation
  const _clearCallback = function (this: any, cb: (err?: Error | null) => void): ModelType {
    opts.driver.clear(opts.table, function (err?: Error | null) {
      if (typeof cb === "function") cb(err);
    });

    return this;
  };

  // Public async-only interface - wrapped to return Promise<void>
  model.clear = function (): Promise<void> {
    return new Promise((resolve, reject) => {
      _clearCallback.call(model, (err?: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  };

  model.prependValidation = function (key: string, validation: any): void {
    const validations = opts.validations || {};
    if (validations.hasOwnProperty(key)) {
      validations[key].splice(0, 0, validation);
    } else {
      validations[key] = [validation];
    }
  };

  const currFields: { [key: string]: boolean } = {};

  model.addProperty = function (propIn: any, options?: any): PropertyDefinition {
    let cType: any;
    const prop = Property.normalize({
      prop: propIn,
      name: (options && options.name) || propIn.name,
      customTypes: opts.db.customTypes,
      settings: opts.settings!
    });

    let k = prop.name;
    const keys = Array.isArray(opts.keys) ? opts.keys : [opts.keys!];

    if (keys.indexOf(k) !== -1) {
      prop.key = true;
    } else if (prop.key) {
      if (!opts.keys) opts.keys = [];
      if (Array.isArray(opts.keys)) {
        opts.keys.push(k);
      } else {
        opts.keys = [opts.keys, k];
      }
    }

    if (options && options.klass) {
      prop.klass = options.klass;
    }

    switch (prop.klass) {
      case 'primary':
        if (!opts.properties) opts.properties = {};
        opts.properties[prop.name] = prop as any;
        break;
      case 'hasOne':
        association_properties.push(prop.name);
        break;
    }

    allProperties[prop.name] = prop;
    fieldToPropertyMap[prop.mapsTo] = prop;

    if (prop.required) {
      model.prependValidation(prop.name, Validators.required());
    }

    if (prop.key && prop.klass === 'primary') {
      keyProperties.push(prop);
    }

    if (prop.lazyload !== true && !currFields[prop.name]) {
      currFields[prop.name] = true;
      if ((cType = opts.db.customTypes[prop.type]) && cType.datastoreGet) {
        model_fields.push({
          a: prop.mapsTo,
          sql: cType.datastoreGet(prop, opts.db.driver.query)
        });
      } else {
        model_fields.push(prop.mapsTo);
      }
    }

    return prop;
  };

  // model.table and model.settings already set above (line 254-262)

  const validations = opts.validations || {};
  for (let k in validations) {
    if (!Array.isArray(validations[k])) {
      validations[k] = [validations[k]];
    }
  }

  const keys = Array.isArray(opts.keys) ? opts.keys : (opts.keys ? [opts.keys] : []);
  const properties = opts.properties || {};

  if (keys.length === 0 && !_.some(properties, { key: true })) {
    properties[opts.settings!.get("properties.primary_key")] = {
      type: 'serial',
      key: true,
      required: false,
      klass: 'primary'
    } as any;
  }

  for (const k in properties) {
    model.addProperty(properties[k], { name: k, klass: 'primary' });
  }

  if (keyProperties.length === 0) {
    throw new ORMError("Model defined without any keys", 'BAD_MODEL', { model: opts.table });
  }

  // Set model.properties to reference allProperties (not a copy)
  model.properties = allProperties;

  // Set model.id based on opts.keys
  Object.defineProperty(model, "id", {
    value: opts.keys,
    enumerable: false
  });
  
  Object.defineProperty(model, "uid", {
    value: opts.driver.uid + "/" + opts.table + "/" + (Array.isArray(opts.keys) ? opts.keys.join("/") : opts.keys),
    enumerable: false
  });

  for (const k in AvailableHooks) {
    (model as any)[AvailableHooks[k]] = createHookHelper(AvailableHooks[k]);
  }

  OneAssociation.prepare(model, one_associations as any);
  ManyAssociation.prepare(opts.db, model, many_associations as any);
  ExtendAssociation.prepare(opts.db, model, extend_associations as any);

  return model as ModelType;
}
