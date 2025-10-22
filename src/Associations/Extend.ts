/**
 * Extend Associations
 */

import * as _ from 'lodash';
import * as ORMError from '../Error';
import * as Singleton from '../Singleton';
import * as util from '../Utilities';
import type { AssociationType } from '../types/Core';

const ACCESSOR_METHODS = ["hasAccessor", "getAccessor", "setAccessor", "delAccessor"];

const rejectCallback = (context: string, args: any[]): void => {
  if (args.some((arg) => typeof arg === 'function')) {
    throw new TypeError(`${context} no longer accepts callbacks. Await the returned promise instead.`);
  }
};

export function prepare(db: any, Model: any, associations: any[]): void {
  Model.extendsTo = function (name: string, properties: Record<string, any>, opts?: any): any {
    opts = opts || {};

    const assocName = opts.name || ucfirst(name);
    const association: Record<string, any> = {
      name: name,
      table: opts.table || (Model.table + '_' + name),
      reversed: opts.reversed,
      autoFetch: opts.autoFetch || false,
      autoFetchLimit: opts.autoFetchLimit || 2,
      field: util.wrapFieldObject({
        field: opts.field, model: Model, altName: Model.table
      }) || util.formatField(Model, Model.table, false, false),
      getAccessor: opts.getAccessor || ("get" + assocName),
      setAccessor: opts.setAccessor || ("set" + assocName),
      hasAccessor: opts.hasAccessor || ("has" + assocName),
      delAccessor: opts.delAccessor || ("remove" + assocName)
    };

    const newproperties = _.cloneDeep(properties);
    for (const k in association.field) {
      newproperties[k] = association.field[k];
    }

    const modelOpts = _.extend(
      _.pick(opts, 'identityCache', 'autoSave', 'cascadeRemove', 'hooks', 'methods', 'validations'),
      {
        id: Object.keys(association.field),
        extension: true,
      }
    );

    association.model = db.define(association.table, newproperties, modelOpts);
    association.model.hasOne(Model.table, Model, { extension: true, field: association.field });

    associations.push(association);

    Model["findBy" + assocName] = function (...args: any[]): any {
      rejectCallback(`${Model.modelName || Model.table}.findBy${assocName}`, args);

      let conditions: any = null;
      let options: any = {};

      for (let i = 0; i < args.length; i++) {
        if (typeof args[i] === "object" && args[i] !== null) {
          if (conditions === null) {
            conditions = args[i];
          } else {
            options = args[i];
          }
        }
      }

      if (conditions === null) {
        throw new ORMError.ORMError(".findBy(" + assocName + ") is missing a conditions object", 'PARAM_MISMATCH');
      }

      options.__merge = {
        from: { table: association.model.table, field: Object.keys(association.field) },
        to: { table: Model.table, field: Model.id },
        where: [association.model.table, conditions],
        table: Model.table
      };
      options.extra = [];

      return Model.find({}, options);
    };

    return association.model;
  };
}

export function extend(Model: any, Instance: any, Driver: any, associations: any[], opts: Record<string, unknown>): void {
  for (let i = 0; i < associations.length; i++) {
    extendInstance(Model, Instance, Driver, associations[i], opts);
  }
}

export function autoFetch(Instance: any, associations: any[], opts: Record<string, unknown>, cb: (err?: Error) => void): void {
  if (associations.length === 0) {
    return cb();
  }

  let pending = associations.length;
  const autoFetchDone = function (): void {
    pending -= 1;

    if (pending === 0) {
      return cb();
    }
  };

  for (let i = 0; i < associations.length; i++) {
    autoFetchInstance(Instance, associations[i], opts, autoFetchDone);
  }
}

function extendInstance(Model: any, Instance: any, Driver: any, association: any, opts: Record<string, unknown>): void {
  const promiseFunctionPostfix = Model.settings.get('promiseFunctionPostfix');

  const getModelIds = (): string[] => Array.isArray(Model.id) ? Model.id : [Model.id];

  const ensurePersisted = (): string[] => {
    const modelIds = getModelIds();
    if (!util.hasValues(Instance, modelIds)) {
      throw new ORMError.ORMError("Instance not saved, cannot get extension", 'NOT_DEFINED', { model: Model.table });
    }
    return modelIds;
  };

  const removeExtensionsForInstance = async (modelIds: string[]): Promise<void> => {
    const conditions: Record<string, any> = {};
    const fields = Object.keys(association.field);

    for (let i = 0; i < modelIds.length; i++) {
      conditions[fields[i]] = Instance[modelIds[i]];
    }

    const extensions = await association.model.find(conditions).run();

    if (!extensions || extensions.length === 0) {
      return;
    }

    for (const extension of extensions) {
      if (extension && typeof extension.__singleton_uid === 'function') {
        Singleton.clear(extension.__singleton_uid());
      }
      await extension.remove();
    }
  };

  Object.defineProperty(Instance, association.hasAccessor, {
    value: function (...args: any[]): any {
      rejectCallback(`${Model.modelName || Model.table}.${association.hasAccessor}`, args);

      return (async () => {
        const modelIds = ensurePersisted();
        try {
          await association.model.get(util.values(Instance, modelIds));
          return true;
        } catch (err: any) {
          if (err && err.code === 'NOT_FOUND') {
            return false;
          }
          throw err;
        }
      })();
    },
    enumerable: false,
    writable: true
  });

  Object.defineProperty(Instance, association.getAccessor, {
    value: function (...args: any[]): any {
      rejectCallback(`${Model.modelName || Model.table}.${association.getAccessor}`, args);
      const options = args.length > 0 ? args[0] : undefined;

      return (async () => {
        const modelIds = ensurePersisted();
        const values = util.values(Instance, modelIds);
        const normalized = options && typeof options === 'object' ? options : {};
        const queryArgs: any[] = [values];
        if (Object.keys(normalized).length) {
          queryArgs.push(normalized);
        }
        return await association.model.get.apply(association.model, queryArgs);
      })();
    },
    enumerable: false,
    writable: true
  });

  Object.defineProperty(Instance, association.setAccessor, {
    value: function (...args: any[]): any {
      rejectCallback(`${Model.modelName || Model.table}.${association.setAccessor}`, args);
      const Extension = args[0];

      return (async () => {
        const modelIds = ensurePersisted();
        const fields = Object.keys(association.field);

        await Instance.save({}, { saveAssociations: false });

        let extensionInstance = Extension;
        if (!extensionInstance || !extensionInstance.isInstance) {
          extensionInstance = new association.model(extensionInstance);
        }

        await removeExtensionsForInstance(modelIds);

        for (let i = 0; i < modelIds.length; i++) {
          extensionInstance[fields[i]] = Instance[modelIds[i]];
        }

        await extensionInstance.save({}, { saveAssociations: false });

        return Instance;
      })();
    },
    enumerable: false,
    writable: true
  });

  Object.defineProperty(Instance, association.delAccessor, {
    value: function (...args: any[]): any {
      rejectCallback(`${Model.modelName || Model.table}.${association.delAccessor}`, args);

      return (async () => {
        const modelIds = ensurePersisted();
        await removeExtensionsForInstance(modelIds);
        return Instance;
      })();
    },
    enumerable: false,
    writable: true
  });

  if (promiseFunctionPostfix) {
    for (let i = 0; i < ACCESSOR_METHODS.length; i++) {
      const name = ACCESSOR_METHODS[i];
      const baseName = association[name];
      const asyncName = baseName + promiseFunctionPostfix;
      if (!Object.prototype.hasOwnProperty.call(Instance, asyncName)) {
        Object.defineProperty(Instance, asyncName, {
          value: Instance[baseName],
          enumerable: false,
          writable: true
        });
      }
    }
  }
}

function autoFetchInstance(Instance: any, association: any, opts: any, cb: Function): void {
  if (!Instance.saved()) {
    return cb();
  }

  if (!Object.prototype.hasOwnProperty.call(opts, "autoFetchLimit") || !opts.autoFetchLimit) {
    opts.autoFetchLimit = association.autoFetchLimit;
  }

  if (opts.autoFetchLimit === 0 || (!opts.autoFetch && !association.autoFetch)) {
    return cb();
  }

  if (Instance.isPersisted()) {
    Instance[association.getAccessor]({ autoFetchLimit: opts.autoFetchLimit - 1 })
      .then((Assoc: any) => {
        Instance[association.name] = Assoc;
      })
      .catch(() => {
        // ignore auto-fetch errors to align with legacy behavior
      })
      .finally(() => cb());
  } else {
    return cb();
  }
}

function ucfirst(text: string): string {
  return text[0].toUpperCase() + text.substr(1);
}

export default { prepare, extend, autoFetch };
