/**
 * Lazy loading utilities
 */

import { promisify } from 'util';

const LAZY_METHOD_NAMES = ["get", "remove", "set"];

function ucfirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function conditionAssign(instance: any, model: any): Record<string, any> {
  const conditions: Record<string, any> = {};
  conditions[model.id] = instance[model.id];
  return conditions;
}

function addLazyLoadProperty(name: string, Instance: any, Model: any, property: string): void {
  const method = ucfirst(name);
  const promiseFunctionPostfix = Model.settings.get('promiseFunctionPostfix');
  
  const functionNames = {
    get: {
      callback: "get" + method,
      promise: "get" + method + promiseFunctionPostfix
    },
    remove: {
      callback: "remove" + method,
      promise: "remove" + method + promiseFunctionPostfix
    },
    set: {
      callback: "set" + method,
      promise: "set" + method + promiseFunctionPostfix
    }
  };

  Object.defineProperty(Instance, functionNames.get.callback, {
    value: function (this: any, cb: (err: Error | null, data?: any) => void) {
      const conditions = conditionAssign(Instance, Model);
      
      Model.find(conditions, { identityCache: false }).only(Model.id.concat(property)).first((err: Error | null, item: any) => {
        return cb(err, item ? item[property] : null);
      });

      return this;
    },
    enumerable: false
  });

  Object.defineProperty(Instance, functionNames.remove.callback, {
    value: function (this: any, cb: (err: Error | null) => void) {
      const conditions = conditionAssign(Instance, Model);
      
      Model.find(conditions, { identityCache: false }).only(Model.id.concat(property)).first((err: Error | null, item: any) => {
        if (err) return cb(err);
        if (!item) return cb(null);

        item[property] = null;
        return item.save(cb);
      });

      return this;
    },
    enumerable: false
  });

  Object.defineProperty(Instance, functionNames.set.callback, {
    value: function (this: any, data: any, cb: (err: Error | null) => void) {
      const conditions = conditionAssign(Instance, Model);
      
      Model.find(conditions, { identityCache: false }).first((err: Error | null, item: any) => {
        if (err) return cb(err);
        if (!item) return cb(null);

        item[property] = data;
        return item.save(cb);
      });

      return this;
    },
    enumerable: false
  });

  for (const methodName of LAZY_METHOD_NAMES) {
    Object.defineProperty(Instance, functionNames[methodName as keyof typeof functionNames].promise, {
      value: promisify(Instance[functionNames[methodName as keyof typeof functionNames].callback]),
      enumerable: false
    });
  }
}

export function extend(Instance: any, Model: any, properties: Record<string, any>): void {
  for (const k in properties) {
    if (properties[k].lazyload === true) {
      addLazyLoadProperty(properties[k].lazyname || k, Instance, Model, k);
    }
  }
}

export default { extend };
