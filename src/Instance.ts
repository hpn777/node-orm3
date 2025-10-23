/**
 * Instance - Model instance with lifecycle hooks
 */

import * as Utilities from './Utilities';
import * as Property from './Property';
import * as Hook from './Hook';
import enforce from './vendor/enforce';
import { promisify } from './utils/promises';
import type { InstanceData, HookMap, PropertyDefinition } from './types/Core';

export interface InstanceOptions {
  data?: InstanceData;
  extra?: any;
  keys?: string | string[];
  is_new?: boolean;
  changes?: string[];
  extrachanges?: string[];
  associations?: Record<string, unknown>;
  originalKeyValues?: Record<string, unknown>;
  keyProperties: PropertyDefinition[];
  table: string;
  driver: any;  // TODO: phase 3 - implement IDriver interface
  hooks: HookMap;
  validations: Record<string, unknown[]>;
  one_associations: any[];  // TODO: phase 3 - typed associations
  many_associations: any[];  // TODO: phase 3 - typed associations
  methods: Record<string, Function>;
  autoSave?: boolean;
  autoFetch?: boolean;
  autoFetchLimit?: number;
  cascadeRemove?: boolean;
  extra_info?: {
    id: (string | number)[];
    id_prop: string[];
    assoc_prop: string[];
    table: string;
  };
  setupAssociations: (instance: Record<string, unknown>, opts?: {
    autoFetch?: boolean;
    autoFetchLimit?: number;
    cascadeRemove?: boolean;
  }) => void;
  uid?: string;
  isShell?: boolean;
}

interface SaveOptions {
  saveAssociations?: boolean;
}

const INSTANCE_METHOD_NAMES = ["save", "remove", "validate"];

export function Instance(Model: any, opts: InstanceOptions): any {
  opts = opts || {} as InstanceOptions;
  opts.data = opts.data || {};
  opts.extra = opts.extra || {};
  opts.keys = opts.keys || "id";
  opts.changes = (opts.is_new ? Object.keys(opts.data) : []);
  opts.extrachanges = [];
  opts.associations = {};
  opts.originalKeyValues = {};

  let instance_saving = false;
  const events: Record<string, Function[]> = {};
  const instance: any = {};

  const emitEvent = function (...args: any[]): void {
    const event = args.shift();

    if (!Object.prototype.hasOwnProperty.call(events, event)) return;

    events[event].map((cb) => {
      cb.apply(instance, args);
    });
  };

  const rememberKeys = (): void => {
    let i: number, prop: any;

    for (i = 0; i < opts.keyProperties.length; i++) {
      prop = opts.keyProperties[i];
      opts.originalKeyValues![prop.name] = opts.data![prop.name];
    }
  };

  const shouldSaveAssocs = (saveOptions: SaveOptions): boolean => {
    if (Model.settings.get("instance.saveAssociationsByDefault")) {
      return saveOptions.saveAssociations !== false;
    } else {
      return !!saveOptions.saveAssociations;
    }
  };

  const handleValidations = async (): Promise<any> => {
    let required: boolean, alwaysValidate: boolean;

    return new Promise<any[]>((resolve, reject) => {
      Hook.wait(instance, opts.hooks.beforeValidation, (err?: Error) => {
        let k: string, i: number;
        if (err) {
          return reject(err);
        }

        const checks = new (enforce as any).Enforce({
          returnAllErrors: Model.settings.get("instance.returnAllErrors")
        });

        for (k in opts.validations) {
          required = false;

          if (Model.properties[k]) {
            required = Model.properties[k].required;
            alwaysValidate = Model.properties[k].alwaysValidate;
          } else {
            for (i = 0; i < opts.one_associations.length; i++) {
              if (opts.one_associations[i].field === k) {
                required = opts.one_associations[i].required;
                break;
              }
            }
          }
          if (!alwaysValidate && !required && instance[k] == null) {
            continue;
          }
          for (i = 0; i < opts.validations[k].length; i++) {
            checks.add(k, opts.validations[k][i]);
          }
        }

        checks.context("instance", instance);
        checks.context("model", Model);
        checks.context("driver", opts.driver);

        checks.check(instance, (validationErr?: any) => {
          resolve(validationErr ?? null);
        });
      });
    });
  };

  const saveError = (err: any): never => {
    emitEvent("save", err, instance);

    Hook.trigger(instance, opts.hooks.afterSave, false);

    throw err;
  };

  const runAfterSaveActions = async (create: boolean, err?: Error): Promise<void> => {
    emitEvent("save", err, instance);

    if (create) {
      Hook.trigger(instance, opts.hooks.afterCreate, !err);
    }
    Hook.trigger(instance, opts.hooks.afterSave, !err);
  };

  const markAsFinalizedError = (err: any): Error => {
    if (err && typeof err === "object") {
      (err as any).__skipSaveErrorHandling = true;
      return err as Error;
    }

    const wrapped = new Error(String(err));
    (wrapped as any).__skipSaveErrorHandling = true;
    return wrapped;
  };

  const saveInstance = async (saveOptions: SaveOptions = {}): Promise<void> => {
    if (instance_saving && saveOptions.saveAssociations !== false) {
      return;
    }

    instance_saving = true;

    try {
      if (Object.keys(opts.validations || {}).length !== 0) {
        const validationErrors = await handleValidations();

        if (Array.isArray(validationErrors)) {
          if (validationErrors.length) {
            throw validationErrors;
          }
        } else if (validationErrors) {
          throw validationErrors;
        }
      }

      if (opts.is_new) {
        await saveNew(saveOptions, getInstanceData());
      } else {
        await savePersisted(saveOptions, getInstanceData());
      }
    } catch (err: any) {
      if (err && err.__skipSaveErrorHandling) {
        throw err;
      }
      saveError(err);
    } finally {
      instance_saving = false;
    }
  };

  const getInstanceData = (): Record<string, any> => {
    const data: Record<string, any> = {};
    let prop: any;

    for (const k in opts.data) {
      if (!Object.prototype.hasOwnProperty.call(opts.data, k)) continue;
      prop = Model.properties[k];

      if (prop) {
        if (opts.driver.propertyToValue) {
          data[k] = opts.driver.propertyToValue(opts.data![k], prop);
        } else {
          data[k] = opts.data![k];
        }
      }
      // Skip properties that don't exist in the model schema
      // to avoid SQL errors for unknown columns
    }

    return data;
  };

  const waitHooks = (hooks: string[], next: (err?: Error) => void): void => {
    const nextHook = (): void => {
      if (hooks.length === 0) {
        return next();
      }
      Hook.wait(instance, opts.hooks[hooks.shift()!], (err?: Error) => {
        if (err) {
          return next(err);
        }

        return nextHook();
      });
    };

    return nextHook();
  };

  const saveNew = async (saveOptions: SaveOptions, data: Record<string, any>): Promise<void> => {
    let i: number, prop: any;

    data = Utilities.transformPropertyNames(data, Model.properties);

    const info = await new Promise<any>((resolve, reject) => {
      opts.driver.insert(opts.table, data, opts.keyProperties, (saveErr: Error | null, insertInfo?: any) => {
        if (saveErr) {
          return reject(saveErr);
        }
        resolve(insertInfo);
      });
    });

    opts.changes!.length = 0;

    const insertInfo = info || {};

    for (i = 0; i < opts.keyProperties.length; i++) {
      prop = opts.keyProperties[i];
      opts.data![prop.name] = Object.prototype.hasOwnProperty.call(insertInfo, prop.name) ? insertInfo[prop.name] : data[prop.name];
    }
    opts.is_new = false;
    rememberKeys();

    let assocError: Error | undefined;

    if (shouldSaveAssocs(saveOptions)) {
      try {
        await saveAssociations();
      } catch (err) {
        assocError = err as Error;
      }
    }

    await runAfterSaveActions(true, assocError);

    if (assocError) {
      throw assocError;
    }

    try {
      await saveInstanceExtra();
    } catch (err) {
      throw markAsFinalizedError(err);
    }
  };

  const savePersisted = async (saveOptions: SaveOptions, data: Record<string, any>): Promise<void> => {
    let changes: Record<string, any> = {};
    const conditions: Record<string, any> = {};
    let i: number, prop: any;
    let saved = false;

    if (opts.changes!.length !== 0) {
      for (i = 0; i < opts.changes!.length; i++) {
        changes[opts.changes![i]] = data[opts.changes![i]];
      }
      for (i = 0; i < opts.keyProperties.length; i++) {
        prop = opts.keyProperties[i];
        conditions[prop.mapsTo] = opts.originalKeyValues![prop.name];
      }
      changes = Utilities.transformPropertyNames(changes, Model.properties) as any;

      await new Promise<void>((resolve, reject) => {
        opts.driver.update(opts.table, changes, conditions, (err?: Error) => {
          if (err) {
            return reject(err);
          }
          resolve();
        });
      });

      saved = true;
      opts.changes!.length = 0;
      rememberKeys();
    }

    let assocSaved = false;
    let assocError: Error | undefined;

    if (shouldSaveAssocs(saveOptions)) {
      try {
        assocSaved = await saveAssociations();
      } catch (err) {
        assocError = err as Error;
        assocSaved = true;
      }
    }

    if (saved || assocSaved) {
      await runAfterSaveActions(false, assocError);
    }

    if (assocError) {
      throw assocError;
    }

    try {
      await saveInstanceExtra();
    } catch (err) {
      throw markAsFinalizedError(err);
    }
  };

  const callWithPromise = async (accessor: string, payload: any): Promise<void> => {
    const fn = instance[accessor];

    if (typeof fn !== "function") {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      let settled = false;

      const finalize = (err?: Error | null) => {
        if (settled) return;
        settled = true;
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      };

      try {
        const possiblePromise = fn.call(instance, payload);

        if (possiblePromise && typeof possiblePromise.then === "function") {
          possiblePromise.then(() => finalize(), (err: Error) => finalize(err));
        } else {
          finalize();
        }
      } catch (err) {
        finalize(err as Error);
      }
    });
  };

  const saveAssociations = async (): Promise<boolean> => {
    let savedAny = false;

    const saveOneAssociation = async (assoc: any): Promise<void> => {
      if (!instance[assoc.name] || typeof instance[assoc.name] !== "object") return;

      if (assoc.reversed) {
        if (!Array.isArray(instance[assoc.name])) {
          instance[assoc.name] = [instance[assoc.name]];
        }

        for (let i = 0; i < instance[assoc.name].length; i++) {
          if (!instance[assoc.name][i].isInstance) {
            instance[assoc.name][i] = new assoc.model(instance[assoc.name][i]);
          }
          await callWithPromise(assoc.setAccessor, instance[assoc.name][i]);
          savedAny = true;
        }
        return;
      }

      if (!instance[assoc.name].isInstance) {
        instance[assoc.name] = new assoc.model(instance[assoc.name]);
      }

      await callWithPromise(assoc.setAccessor, instance[assoc.name]);
      savedAny = true;
    };

    for (let i = 0; i < opts.one_associations.length; i++) {
      await saveOneAssociation(opts.one_associations[i]);
    }

    const saveManyAssociation = async (assoc: any): Promise<void> => {
      const assocVal = instance[assoc.name];

      if (!Array.isArray(assocVal)) return;
      if (!((opts.associations as any)![assoc.name]).changed) return;

      for (let j = 0; j < assocVal.length; j++) {
        if (!assocVal[j].isInstance) {
          assocVal[j] = new assoc.model(assocVal[j]);
        }
      }

      await callWithPromise(assoc.setAccessor, assocVal);
      savedAny = true;
    };

    for (let i = 0; i < opts.many_associations.length; i++) {
      await saveManyAssociation(opts.many_associations[i]);
    }

    return savedAny;
  };

  const saveInstanceExtra = async (): Promise<void> => {
    if (opts.extrachanges!.length === 0) {
      return;
    }

    const data: Record<string, any> = {};
    const conditions: Record<string, any> = {};

    for (let i = 0; i < opts.extrachanges!.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(opts.data, opts.extrachanges![i])) continue;

      if (opts.extra![opts.extrachanges![i]]) {
        data[opts.extrachanges![i]] = opts.data![opts.extrachanges![i]];
        if (opts.driver.propertyToValue) {
          data[opts.extrachanges![i]] = opts.driver.propertyToValue(data[opts.extrachanges![i]], opts.extra![opts.extrachanges![i]]);
        }
      } else {
        data[opts.extrachanges![i]] = opts.data![opts.extrachanges![i]];
      }
    }

    const keys = Array.isArray(opts.keys) ? opts.keys : [opts.keys];
    for (let i = 0; i < opts.extra_info!.id.length; i++) {
      conditions[opts.extra_info!.id_prop[i]] = opts.extra_info!.id[i];
      const key = keys[i];
      if (key) {
        conditions[opts.extra_info!.assoc_prop[i]] = opts.data![key];
      }
    }

    await new Promise<void>((resolve, reject) => {
      opts.driver.update(opts.extra_info!.table, data, conditions, (err?: Error) => {
        if (err) {
          return reject(err);
        }
        resolve();
      });
    });
  };

  const removeInstance = async (): Promise<void> => {
    if (opts.is_new) {
      return;
    }

    const conditions: Record<string, any> = {};
    const keys = Array.isArray(opts.keys) ? opts.keys : [opts.keys];

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key) {
        conditions[key] = opts.data![key];
      }
    }

    try {
      await new Promise<void>((resolve, reject) => {
        Hook.wait(instance, opts.hooks.beforeRemove, (err?: Error) => {
          if (err) return reject(err);
          resolve();
        });
      });
    } catch (err) {
      emitEvent("remove", err, instance);
      throw err;
    }

    emitEvent("beforeRemove", instance);

    try {
      await new Promise<void>((resolve, reject) => {
        opts.driver.remove(opts.table, conditions, (err?: Error) => {
          if (err) return reject(err);
          resolve();
        });
      });
    } catch (err) {
      Hook.trigger(instance, opts.hooks.afterRemove, false);
      emitEvent("remove", err, instance);
      throw err;
    }

    Hook.trigger(instance, opts.hooks.afterRemove, true);
    emitEvent("remove", undefined, instance);
  };

  const saveInstanceProperty = (key: string, value: any): void => {
    const changes: Record<string, any> = {};
    const conditions: Record<string, any> = {};
    changes[key] = value;

    if (Model.properties[key]) {
      if (opts.driver.propertyToValue) {
        changes[key] = opts.driver.propertyToValue(changes[key], Model.properties[key]);
      }
    }

    const keys = Array.isArray(opts.keys) ? opts.keys : [opts.keys];
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key) {
        conditions[key] = opts.data![key];
      }
    }

    Hook.wait(instance, opts.hooks.beforeSave, (err?: Error) => {
      if (err) {
        Hook.trigger(instance, opts.hooks.afterSave, false);
        emitEvent("save", err, instance);
        return;
      }

      opts.driver.update(opts.table, changes, conditions, (err?: Error) => {
        if (!err) {
          opts.data![key] = value;
        }
        Hook.trigger(instance, opts.hooks.afterSave, !err);
        emitEvent("save", err, instance);
      });
    });
  };

  const setInstanceProperty = (key: string, value: any): boolean => {
    const prop = Model.properties[key] || opts.extra![key];

    if (prop) {
      if ('valueToProperty' in opts.driver) {
        value = opts.driver.valueToProperty(value, prop);
      }
      if (opts.data![key] !== value) {
        opts.data![key] = value;
        return true;
      }
    }
    return false;
  };

  const setPropertyByPath = (path: string | string[], value: any): void => {
    if (typeof path === 'string') {
      path = path.split('.');
    } else if (!Array.isArray(path)) {
      return;
    }

    const propName = path.shift()!;
    const prop = Model.properties[propName] || opts.extra![propName];
    let currKey: string, currObj: any;

    if (!prop) {
      return;
    }
    if (path.length === 0) {
      instance[propName] = value;
      return;
    }
    currObj = instance[propName];

    while (currObj && path.length > 0) {
      currKey = path.shift()!;

      if (path.length > 0) {
        currObj = currObj[currKey];
      } else if (currObj[currKey] !== value) {
        currObj[currKey] = value;
        opts.changes!.push(propName);
      }
    }
  };

  const addInstanceProperty = (key: string): void => {
    let defaultValue: any = undefined;
    const prop = Model.properties[key];

    if (Object.prototype.hasOwnProperty.call(instance, key)) {
      console.log("Overwriting instance property");
    }

    if (key in opts.data!) {
      defaultValue = opts.data![key];
    } else if (prop && 'defaultValue' in prop) {
      defaultValue = prop.defaultValue;
    }

    setInstanceProperty(key, defaultValue);

    Object.defineProperty(instance, key, {
      get: function () {
        const val = opts.data![key];

        if (val === undefined) {
          return null;
        } else {
          return opts.data![key];
        }
      },
      set: function (val: any) {
        if (prop.key === true) {
          if (prop.type === 'serial' && opts.data![key] != null) {
            return;
          } else {
            opts.originalKeyValues![prop.name] = opts.data![prop.name];
          }
        }

        if (!setInstanceProperty(key, val)) {
          return;
        }

        if (opts.autoSave) {
          saveInstanceProperty(key, val);
        } else if (opts.changes!.indexOf(key) === -1) {
          opts.changes!.push(key);
        }
      },
      enumerable: !(prop && !prop.enumerable)
    });
  };

  const addInstanceExtraProperty = (key: string): void => {
    if (!Object.prototype.hasOwnProperty.call(instance, "extra")) {
      instance.extra = {};
    }
    Object.defineProperty(instance.extra, key, {
      get: function () {
        return opts.data![key];
      },
      set: function (val: any) {
        setInstanceProperty(key, val);

        if (opts.extrachanges!.indexOf(key) === -1) {
          opts.extrachanges!.push(key);
        }
      },
      enumerable: true
    });
  };

  let i: number, k: string;

  for (k in Model.properties) {
    addInstanceProperty(k);
  }
  for (k in opts.extra) {
    addInstanceProperty(k);
  }

  for (k in opts.methods) {
    Object.defineProperty(instance, k, {
      value: opts.methods[k].bind(instance),
      enumerable: false,
      writable: true
    });
  }

  for (k in opts.extra) {
    addInstanceExtraProperty(k);
  }

  Object.defineProperty(instance, "on", {
    value: function (event: string, cb: Function) {
      if (!events.hasOwnProperty(event)) {
        events[event] = [];
      }
      events[event].push(cb);

      return this;
    },
    enumerable: false,
    writable: true
  });

  Object.defineProperty(instance, "save", {
    value: async function (...args: any[]) {
      let arg: any = null;
      let objCount = 0;
      const data: Record<string, any> = {};
      let saveOptions: SaveOptions = {};
      let callback: ((err?: Error | null, instance?: any) => void) | null = null;

      while (args.length > 0) {
        arg = args.shift();

        switch (typeof arg) {
          case 'object':
            switch (objCount) {
              case 0:
                Object.assign(data, arg);
                break;
              case 1:
                saveOptions = arg;
                break;
            }
            objCount++;
            break;
          case 'function':
            callback = arg;
            break;
          default:
            const err: any = new Error("Unknown parameter type '" + (typeof arg) + "' in Instance.save()");
            err.model = Model.table;
            throw err;
        }
      }

      for (const k in data) {
        if (Object.prototype.hasOwnProperty.call(data, k)) {
          this[k] = data[k];
        }
      }

      const invokeCallback = (err?: Error | null): Error | null => {
        if (!callback) return null;

        try {
          callback(err || undefined, err ? undefined : instance);
          return null;
        } catch (cbErr) {
          return cbErr as Error;
        }
      };

      try {
        await saveInstance(saveOptions);
      } catch (err) {
        const callbackErr = invokeCallback(err as Error);
        throw callbackErr || err;
      }

      const callbackErr = invokeCallback(null);
      if (callbackErr) {
        throw callbackErr;
      }

      return instance;
    },
    enumerable: false,
    writable: true
  });

  Object.defineProperty(instance, "saved", {
    value: function () {
      return opts.changes!.length === 0;
    },
    enumerable: false,
    writable: true
  });

  Object.defineProperty(instance, "remove", {
    value: async function () {
      await removeInstance();
      return instance;
    },
    enumerable: false,
    writable: true
  });

  Object.defineProperty(instance, "set", {
    value: setPropertyByPath,
    enumerable: false,
    writable: true
  });

  Object.defineProperty(instance, "markAsDirty", {
    value: function (propName?: string) {
      if (propName !== undefined) {
        opts.changes!.push(propName);
      }
    },
    enumerable: false,
    writable: true
  });

  Object.defineProperty(instance, "dirtyProperties", {
    get: function () {
      return opts.changes;
    },
    enumerable: false
  });

  Object.defineProperty(instance, "isDirty", {
    value: function () {
      return opts.changes!.length > 0;
    },
    enumerable: false
  });

  Object.defineProperty(instance, "isInstance", {
    value: true,
    enumerable: false
  });

  Object.defineProperty(instance, "isPersisted", {
    value: function () {
      return !opts.is_new;
    },
    enumerable: false,
    writable: true
  });

  Object.defineProperty(instance, "isShell", {
    value: function () {
      return opts.isShell || false;
    },
    enumerable: false
  });

  Object.defineProperty(instance, "validate", {
    value: async function () {
      const errors = await handleValidations();
      return errors || [];
    },
    enumerable: false,
    writable: true
  });

  Object.defineProperty(instance, "__singleton_uid", {
    value: function () {
      return opts.uid;
    },
    enumerable: false
  });

  Object.defineProperty(instance, "__opts", {
    value: opts,
    enumerable: false
  });

  Object.defineProperty(instance, "model", {
    value: function () {
      return Model;
    },
    enumerable: false
  });

  // Methods are now async-only, no need for promisify wrapper

  for (i = 0; i < opts.keyProperties.length; i++) {
    const prop = opts.keyProperties[i];

    if (!(prop.name! in opts.data!)) {
      opts.changes = Object.keys(opts.data!);
      break;
    }
  }
  rememberKeys();

  opts.setupAssociations(instance, {
    autoFetch: opts.autoFetch,
    autoFetchLimit: opts.autoFetchLimit,
    cascadeRemove: opts.cascadeRemove
  });

  for (i = 0; i < opts.one_associations.length; i++) {
    const asc = opts.one_associations[i];

    if (!asc.reversed && !asc.extension) {
      for (k in asc.field) {
        if (!instance.hasOwnProperty(k)) {
          addInstanceProperty(k);
        }
      }
    }

    if (asc.name in opts.data!) {
      const d = opts.data![asc.name];
      const mapper = (obj: any): any => {
        return obj.isInstance ? obj : new asc.model(obj);
      };

      if (Array.isArray(d)) {
        instance[asc.name] = d.map(mapper);
      } else {
        instance[asc.name] = mapper(d);
      }
      delete opts.data![asc.name];
    }
  }

  for (i = 0; i < opts.many_associations.length; i++) {
    const aName = opts.many_associations[i].name;
    opts.associations![aName] = {
      changed: false,
      data: opts.many_associations[i]
    };

    if (Array.isArray(opts.data![aName])) {
      instance[aName] = opts.data![aName];
      delete opts.data![aName];
    }
  }

  Hook.wait(instance, opts.hooks.afterLoad, (err?: Error) => {
    process.nextTick(() => {
      emitEvent("ready", err);
    });
  });

  return instance;
}
