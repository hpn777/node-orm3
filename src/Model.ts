import _ from 'lodash';
import async from 'async';
import { promisify } from 'util';
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
      Hook.wait(instance, modelHooks.beforeCreate, (err?: Error | null) => {
        if (err) {
          return cb(err);
        }

        Hook.wait(instance, modelHooks.beforeSave, (err?: Error | null) => {
          if (err) {
            return cb(err);
          }

          instance.save({}, {}, function (err?: Error | null) {
            if (err) {
              return cb(err);
            }

            Hook.wait(instance, modelHooks.afterSave, (err?: Error | null) => {
              if (err) {
                return cb(err);
              }

              Hook.wait(instance, modelHooks.afterCreate, (err?: Error | null) => {
                if (err) {
                  return cb(err);
                }

                return saveCb(null, instance);
              });
            });
          });
        });
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
      return saveNewInstance(instance, function (err: Error | null, instance?: InstanceType) {
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

  model.drop = function (cb?: (err?: Error | null) => void): ModelType {
    if (!cb) {
      cb = function () {};
    }

    opts.driver.drop({
      table: opts.table,
      properties: allProperties,
      one_associations: one_associations,
      many_associations: many_associations
    }, cb);

    return this;
  };

  model.dropAsync = promisify(model.drop);

  model.sync = function (cb?: (err?: Error | null) => void): ModelType {
    if (!cb) {
      cb = function () {};
    }

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

  model.syncAsync = promisify(model.sync);

  model.get = function (...args: any[]): ModelType {
    let ids: any[] = Array.prototype.slice.apply(args);
    const cb = ids.pop();
    const conditions: QueryConditions = {};
    const options: any = {};

    if (typeof cb !== "function") {
      throw new ORMError("Missing Model.get() callback", 'MISSING_CALLBACK', { model: opts.table });
    }

    const keys = Array.isArray(opts.keys) ? opts.keys : [opts.keys!];

    // Check if last argument before callback is an options object
    if (ids.length > 0 && typeof ids[ids.length - 1] === "object" && !Array.isArray(ids[ids.length - 1])) {
      const lastArg = ids[ids.length - 1];
      // If it doesn't look like it contains ID fields, treat it as options
      const hasIdFields = keys.some((k: string) => Object.prototype.hasOwnProperty.call(lastArg, k));
      if (!hasIdFields && ids.length > 1) {
        // It's an options object
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

    const uid = opts.driver.uid + "/" + opts.table + "/";
    const itemId = uid + keys.map((k: string) => conditions[k]).join("/");

    if (options.identityCache === false) {
      return model.find(conditions, options, function (err: Error | null, items?: InstanceType[]) {
        if (err) {
          return cb(err);
        }
        if (!items || items.length === 0) {
          return cb(new ORMError("Not found", 'NOT_FOUND', { model: opts.table }));
        }
        return cb(null, items[0]);
      });
    }

    Singleton.get(itemId, {
      identityCache: options.identityCache,
      saveCheck: opts.settings!.get("instance.identityCacheSaveCheck")
    }, function (createCb: Function) {
      model.find(conditions, options, function (err: Error | null, items?: InstanceType[]) {
        if (err) {
          return createCb(err);
        }
        if (!items || items.length === 0) {
          return createCb(new ORMError("Not found", 'NOT_FOUND', { model: opts.table }));
        }
        return createCb(null, items[0]);
      });
    }, cb);

    return this;
  };

  model.getAsync = promisify(model.get);

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

    if (typeof cb !== "function") {
      return chain;
    } else {
      chain.run(cb);
      return this;
    }
  };

  model.findAsync = promisify(model.find);

  model.where = model.all = model.find;
  model.whereAsync = model.allAsync = model.findAsync;

  model.one = function (...args: any[]): ModelType {
    let cb: Function | null = null;

    for (let i = 0; i < args.length; i++) {
      if (typeof args[i] === "function") {
        cb = args.splice(i, 1)[0];
        break;
      }
    }

    if (cb === null) {
      throw new ORMError("Missing Model.one() callback", 'MISSING_CALLBACK', { model: opts.table });
    }

    args.push(1);
    args.push(function (err: Error | null, results?: InstanceType[]) {
      if (err) {
        return cb!(err);
      }
      return cb!(null, results && results.length ? results[0] : null);
    });

    return this.find.apply(this, args);
  };

  model.oneAsync = promisify(model.one);

  model.count = function (...args: any[]): ModelType {
    let conditions: QueryConditions | null = null;
    let cb: Function | null = null;

    for (let i = 0; i < args.length; i++) {
      switch (typeof args[i]) {
        case "object":
          conditions = args[i];
          break;
        case "function":
          cb = args[i];
          break;
      }
    }

    if (typeof cb !== "function") {
      throw new ORMError("Missing Model.count() callback", 'MISSING_CALLBACK', { model: opts.table });
    }

    if (conditions) {
      conditions = Utilities.checkConditions(conditions, one_associations as any);
    }

    opts.driver.count(opts.table, conditions || {}, {}, function (err: Error | null, data?: any[]) {
      if (err || !data || data.length === 0) {
        return cb!(err);
      }
      return cb!(null, data[0].c);
    });
    return this;
  };

  model.countAsync = promisify(model.count);

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

  model.exists = function (...args: any[]): ModelType {
    const ids = Array.prototype.slice.apply(args);
    const cb = ids.pop();

    if (typeof cb !== "function") {
      throw new ORMError("Missing Model.exists() callback", 'MISSING_CALLBACK', { model: opts.table });
    }

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
        return cb(err);
      }
      return cb(null, data[0].c > 0);
    });
    return this;
  };

  model.existsAsync = promisify(model.exists);

  model.create = function (...args: any[]): ModelType {
    let itemsParams: any[] = [];
    const items: InstanceType[] = [];
    let options: any = {};
    let done: Function | null = null;
    let single = false;

    for (let i = 0; i < args.length; i++) {
      switch (typeof args[i]) {
        case "object":
          if (!single && Array.isArray(args[i])) {
            itemsParams = itemsParams.concat(args[i]);
          } else if (i === 0) {
            single = true;
            itemsParams.push(args[i]);
          } else {
            options = args[i];
          }
          break;
        case "function":
          done = args[i];
          break;
      }
    }

    const iterator = function (
      params: any,
      index: string | number,
      cb: (err?: Error | null) => void
    ): void {
      createInstance(params, {
        is_new: true,
        autoSave: opts.autoSave,
        autoFetch: false
      }, function (err, item) {
        if (err) {
          if (typeof err === 'object' && err !== null) {
            (err as any).index = index;
            (err as any).instance = item;
          }
          return cb(err);
        }
        item!.save({}, options, function (err?: Error | null) {
          if (err) {
            if (typeof err === 'object' && err !== null) {
              (err as any).index = index;
              (err as any).instance = item;
            }
            return cb(err);
          }
          items[typeof index === 'number' ? index : parseInt(index)] = item!;
          cb();
        });
      });
    };

    async.eachOfSeries(itemsParams, iterator, function (err?: Error | null) {
      if (err) return done!(err);
      done!(null, single ? items[0] : items);
    });

    return this;
  };

  model.createAsync = promisify(model.create);

  model.clear = function (cb?: (err?: Error | null) => void): ModelType {
    opts.driver.clear(opts.table, function (err?: Error | null) {
      if (typeof cb === "function") cb(err);
    });

    return this;
  };

  model.clearAsync = promisify(model.clear);

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
