/**
 * Extend Associations
 */

import * as _ from 'lodash';
import * as ORMError from '../Error';
import * as Singleton from '../Singleton';
import * as util from '../Utilities';
import { promisify } from 'util';

const ACCESSOR_METHODS = ["hasAccessor", "getAccessor", "setAccessor", "delAccessor"];

export function prepare(db: any, Model: any, associations: any[]): void {
  Model.extendsTo = function (name: string, properties: Record<string, any>, opts?: any): any {
    opts = opts || {};

    const assocName = opts.name || ucfirst(name);
    const association: any = {
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
      let cb: Function | null = null;
      let conditions: any = null;
      let options: any = {};

      for (let i = 0; i < args.length; i++) {
        switch (typeof args[i]) {
          case "function":
            cb = args[i];
            break;
          case "object":
            if (conditions === null) {
              conditions = args[i];
            } else {
              options = args[i];
            }
            break;
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

      if (typeof cb === "function") {
        return Model.find({}, options, cb);
      }
      return Model.find({}, options);
    };

    return association.model;
  };
}

export function extend(Model: any, Instance: any, Driver: any, associations: any[], opts: any): void {
  for (let i = 0; i < associations.length; i++) {
    extendInstance(Model, Instance, Driver, associations[i], opts);
  }
}

export function autoFetch(Instance: any, associations: any[], opts: any, cb: Function): void {
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

function extendInstance(Model: any, Instance: any, Driver: any, association: any, opts: any): void {
  const promiseFunctionPostfix = Model.settings.get('promiseFunctionPostfix');

  Object.defineProperty(Instance, association.hasAccessor, {
    value: function (cb: Function): any {
      if (!Instance[Model.id]) {
        cb(new ORMError.ORMError("Instance not saved, cannot get extension", 'NOT_DEFINED', { model: Model.table }));
      } else {
        association.model.get(util.values(Instance, Model.id), (err?: Error, extension?: any) => {
          return cb(err, !err && extension ? true : false);
        });
      }
      return this;
    },
    enumerable: false
  });

  Object.defineProperty(Instance, association.getAccessor, {
    value: function (opts: any, cb?: Function): any {
      if (typeof opts === "function") {
        cb = opts;
        opts = {};
      }

      const modelIds = Array.isArray(Model.id) ? Model.id : [Model.id];
      let hasAllIds = true;
      for (let i = 0; i < modelIds.length; i++) {
        if (!Instance[modelIds[i]]) {
          hasAllIds = false;
          break;
        }
      }
      
      if (!hasAllIds) {
        cb!(new ORMError.ORMError("Instance not saved, cannot get extension", 'NOT_DEFINED', { model: Model.table }));
      } else {
        association.model.get(util.values(Instance, modelIds), opts, cb);
      }
      return this;
    },
    enumerable: false
  });

  Object.defineProperty(Instance, association.setAccessor, {
    value: function (Extension: any, cb: Function): any {
      Instance.save((err?: Error) => {
        if (err) {
          return cb(err);
        }

        Instance[association.delAccessor]((err?: Error) => {
          if (err) {
            return cb(err);
          }

          const fields = Object.keys(association.field);
          const modelIds = Array.isArray(Model.id) ? Model.id : [Model.id];

          if (!Extension.isInstance) {
            Extension = new association.model(Extension);
          }

          for (let i = 0; i < modelIds.length; i++) {
            Extension[fields[i]] = Instance[modelIds[i]];
          }

          Extension.save(cb);
        });
      });
      return this;
    },
    enumerable: false
  });

  Object.defineProperty(Instance, association.delAccessor, {
    value: function (cb: Function): any {
      const modelIds = Array.isArray(Model.id) ? Model.id : [Model.id];
      let hasAllIds = true;
      for (let i = 0; i < modelIds.length; i++) {
        if (!Instance[modelIds[i]]) {
          hasAllIds = false;
          break;
        }
      }
      
      if (!hasAllIds) {
        cb(new ORMError.ORMError("Instance not saved, cannot get extension", 'NOT_DEFINED', { model: Model.table }));
      } else {
        const conditions: Record<string, any> = {};
        const fields = Object.keys(association.field);

        for (let i = 0; i < modelIds.length; i++) {
          conditions[fields[i]] = Instance[modelIds[i]];
        }

        association.model.find(conditions, (err?: Error, extensions?: any[]) => {
          if (err) {
            return cb(err);
          }

          let pending = extensions!.length;

          for (let i = 0; i < extensions!.length; i++) {
            Singleton.clear(extensions![i].__singleton_uid());
            extensions![i].remove(() => {
              if (--pending === 0) {
                return cb();
              }
            });
          }

          if (pending === 0) {
            return cb();
          }
        });
      }
      return this;
    },
    enumerable: false
  });

  for (let i = 0; i < ACCESSOR_METHODS.length; i++) {
    const name = ACCESSOR_METHODS[i];
    const asyncName = association[name] + promiseFunctionPostfix;
    Object.defineProperty(Instance, asyncName, {
      value: promisify(Instance[association[name]]),
      enumerable: false,
      writable: true
    });
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
    Instance[association.getAccessor]({ autoFetchLimit: opts.autoFetchLimit - 1 }, (err?: Error, Assoc?: any) => {
      if (!err) {
        Instance[association.name] = Assoc;
      }

      return cb();
    });
  } else {
    return cb();
  }
}

function ucfirst(text: string): string {
  return text[0].toUpperCase() + text.substr(1);
}

export default { prepare, extend, autoFetch };
