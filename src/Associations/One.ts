/**
 * One-to-One Associations
 */

import * as _ from 'lodash';
import * as util from '../Utilities';
import * as ORMError from '../Error';
import type { HookMap, AssociationType } from '../types/Core';

const Accessors: Record<string, string> = { "get": "get", "set": "set", "has": "has", "del": "remove" };
const ACCESSOR_METHODS = ["hasAccessor", "getAccessor", "setAccessor", "delAccessor"];

const rejectCallback = (context: string, args: any[]): void => {
  if (args.some((arg) => typeof arg === 'function')) {
    throw new TypeError(`${context} no longer accepts callbacks. Await the returned promise instead.`);
  }
};

export function prepare(Model: any, associations: any[]): void {
  Model.hasOne = function (...args: any[]): any {
    let assocName: string;
    let assocTemplateName: string;
    let association: Record<string, any> = {
      name: Model.table,
      model: Model,
      reversed: false,
      extension: false,
      autoFetch: false,
      autoFetchLimit: 2,
      required: false
    };

    for (let i = 0; i < args.length; i++) {
      switch (typeof args[i]) {
        case "string":
          association.name = args[i];
          break;
        case "function":
          if (args[i].table) {
            association.model = args[i];
          }
          break;
        case "object":
          association = _.extend(association, args[i]);
          break;
      }
    }

    assocName = ucfirst(association.name);
    assocTemplateName = association.accessor || assocName;

    if (!Object.prototype.hasOwnProperty.call(association, "field")) {
      association.field = util.formatField(association.model, association.name, association.required, association.reversed);
    } else if (!association.extension) {
      association.field = util.wrapFieldObject({
        field: association.field, model: Model, altName: Model.table,
        mapsTo: association.mapsTo
      });
    }

    util.convertPropToJoinKeyProp(association.field, {
      makeKey: false, required: association.required
    });

    for (const k in Accessors) {
      if (!Object.prototype.hasOwnProperty.call(association, k + "Accessor")) {
        association[k + "Accessor"] = Accessors[k] + assocTemplateName;
      }
    }

    associations.push(association);
    for (const k in association.field) {
      if (!Object.prototype.hasOwnProperty.call(association.field, k)) {
        continue;
      }
      if (!association.reversed) {
        Model.addProperty(
          _.extend({}, association.field[k], { klass: 'hasOne' }),
          false
        );
      }
    }

    if (association.reverse) {
      association.model.hasOne(association.reverse, Model, {
        reversed: true,
        accessor: association.reverseAccessor,
        reverseAccessor: undefined,
        field: association.field,
        autoFetch: association.autoFetch,
        autoFetchLimit: association.autoFetchLimit
      });
    }

    Model["findBy" + assocTemplateName] = function (...args: any[]): any {
      rejectCallback(`${Model.modelName || Model.table}.findBy${assocTemplateName}`, args);

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
        from: { table: association.model.table, field: (association.reversed ? Object.keys(association.field) : association.model.id) },
        to: { table: Model.table, field: (association.reversed ? association.model.id : Object.keys(association.field)) },
        where: [association.model.table, conditions],
        table: Model.table
      };
      options.extra = [];

      return Model.find({}, options);
    };

    return this;
  };
}

export function extend(Model: any, Instance: any, Driver: any, associations: any[]): void {
  for (let i = 0; i < associations.length; i++) {
    extendInstance(Model, Instance, Driver, associations[i]);
  }
}

export function autoFetch(Instance: any, associations: any[], opts: Record<string, unknown>, cb: (err?: Error, result?: any) => void): void {
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

function extendInstance(Model: any, Instance: any, Driver: any, association: any): void {
  const promiseFunctionPostfix = Model.settings.get('promiseFunctionPostfix');

  const normalizeOptions = (opts: any): Record<string, unknown> => {
    if (opts && typeof opts === 'object') {
      return opts;
    }
    return {};
  };

  const isNotFoundError = (err: any): boolean => {
    return !!err && typeof err === 'object' && (err.code === 'NOT_FOUND' || err.type === 'NotFound');
  };

  Object.defineProperty(Instance, association.hasAccessor, {
    value: function (...args: any[]): any {
      rejectCallback(`${Model.modelName || Model.table}.${association.hasAccessor}`, args);
      const options = args.length > 0 ? args[0] : undefined;

      return (async () => {
        if (!util.hasValues(Instance, Object.keys(association.field))) {
          return false;
        }

        try {
          const queryArgs: any[] = [util.values(Instance, Object.keys(association.field))];
          const normalized = normalizeOptions(options);
          if (Object.keys(normalized).length) {
            queryArgs.push(normalized);
          }
          const related = await association.model.get.apply(association.model, queryArgs);
          return !!related;
        } catch (err) {
          if (isNotFoundError(err)) {
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
        const normalized = normalizeOptions(options);

        if (association.reversed) {
          const modelIds = Array.isArray(Model.id) ? Model.id : [Model.id];
          if (!util.hasValues(Instance, modelIds)) {
            return null;
          }

          const conditions = util.getConditions(Model, Object.keys(association.field), Instance);
          const finder = association.model.find(conditions, normalized);
          const results = await finder.run();
          Instance[association.name] = results;
          return results;
        }

        const assignAssociated = async (target: any): Promise<any> => {
          if (!target || !util.hasValues(target, Object.keys(association.field))) {
            return null;
          }

          const queryArgs: any[] = [util.values(target, Object.keys(association.field))];
          if (Object.keys(normalized).length) {
            queryArgs.push(normalized);
          }

          try {
            const associated = await association.model.get.apply(association.model, queryArgs);
            Instance[association.name] = associated;
            return associated;
          } catch (err) {
            if (isNotFoundError(err)) {
              Instance[association.name] = null;
              return null;
            }
            throw err;
          }
        };

        if (Instance.isShell()) {
          try {
            const queryArgs: any[] = [util.values(Instance, Model.id)];
            const modelInstance = await Model.get.apply(Model, queryArgs);
            return await assignAssociated(modelInstance);
          } catch (err) {
            if (isNotFoundError(err)) {
              return null;
            }
            throw err;
          }
        }

        if (!util.hasValues(Instance, Object.keys(association.field))) {
          return null;
        }

        return await assignAssociated(Instance);
      })();
    },
    enumerable: false,
    writable: true
  });

  Object.defineProperty(Instance, association.setAccessor, {
    value: function (...args: any[]): any {
      rejectCallback(`${Model.modelName || Model.table}.${association.setAccessor}`, args);
      const OtherInstance = args[0];

      return (async () => {
        if (association.reversed) {
          await Instance.save();

          const items = Array.isArray(OtherInstance) ? OtherInstance : [OtherInstance];

          for (const item of items) {
            util.populateConditions(Model, Object.keys(association.field), Instance, item, true);
            await item.save({}, { saveAssociations: false });
          }

          return;
        }

        await OtherInstance.save({}, { saveAssociations: false });
        Instance[association.name] = OtherInstance;
        util.populateConditions(association.model, Object.keys(association.field), OtherInstance, Instance);
        await Instance.save({}, { saveAssociations: false });
      })();
    },
    enumerable: false,
    writable: true
  });

  if (!association.reversed) {
    Object.defineProperty(Instance, association.delAccessor, {
      value: function (...args: any[]): any {
        rejectCallback(`${Model.modelName || Model.table}.${association.delAccessor}`, args);

        return (async () => {
          for (const k in association.field) {
            if (Object.prototype.hasOwnProperty.call(association.field, k)) {
              Instance[k] = null;
            }
          }

          await Instance.save({}, { saveAssociations: false });
          delete Instance[association.name];
        })();
      },
      enumerable: false,
      writable: true
    });
  }

  if (promiseFunctionPostfix) {
    for (let i = 0; i < ACCESSOR_METHODS.length; i++) {
      const name = ACCESSOR_METHODS[i];
      const base = Instance[association[name]];
      if (!base) continue;
      if (name === "delAccessor" && !Instance[association.delAccessor]) continue;
      const asyncNameAccessorName = association[name] + promiseFunctionPostfix;

      Object.defineProperty(Instance, asyncNameAccessorName, {
        value: base,
        enumerable: false,
        writable: true
      });
    }
  }
}

function autoFetchInstance(Instance: any, association: any, opts: any, cb: Function): void {
  if (!Instance.saved()) {
    return cb();
  }

  if (!Object.prototype.hasOwnProperty.call(opts, "autoFetchLimit") || typeof opts.autoFetchLimit === "undefined") {
    opts.autoFetchLimit = association.autoFetchLimit;
  }

  if (opts.autoFetchLimit === 0 || (!opts.autoFetch && !association.autoFetch)) {
    return cb();
  }

  if (Instance.isPersisted()) {
    Instance[association.getAccessor]({ autoFetchLimit: opts.autoFetchLimit - 1 })
      .then((Assoc: any) => {
        if (Assoc !== undefined) {
          Instance.__opts.associations[association.name].value = Assoc;
        }
      })
      .catch(() => {
        // ignore auto-fetch errors for backward compatibility
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
