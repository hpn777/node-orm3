/**
 * One-to-One Associations
 */

import * as _ from 'lodash';
import * as async from 'async';
import * as util from '../Utilities';
import * as ORMError from '../Error';
import { promisify } from 'util';
import type { HookMap, AssociationType } from '../types/Core';

const Accessors: Record<string, string> = { "get": "get", "set": "set", "has": "has", "del": "remove" };
const ACCESSOR_METHODS = ["hasAccessor", "getAccessor", "setAccessor", "delAccessor"];

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
        from: { table: association.model.table, field: (association.reversed ? Object.keys(association.field) : association.model.id) },
        to: { table: Model.table, field: (association.reversed ? association.model.id : Object.keys(association.field)) },
        where: [association.model.table, conditions],
        table: Model.table
      };
      options.extra = [];

      if (typeof cb === "function") {
        return Model.find({}, options, cb);
      }
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

  Object.defineProperty(Instance, association.hasAccessor, {
    value: function (opts: any, cb?: Function): any {
      if (typeof opts === "function") {
        cb = opts;
        opts = {};
      }

      if (util.hasValues(Instance, Object.keys(association.field))) {
        association.model.get(util.values(Instance, Object.keys(association.field)), opts, (err?: Error, instance?: any) => {
          return cb!(err, instance ? true : false);
        });
      } else {
        cb!(null, false);
      }

      return this;
    },
    enumerable: false,
    writable: true
  });

  Object.defineProperty(Instance, association.getAccessor, {
    value: function (opts: any, cb?: Function): any {
      if (typeof opts === "function") {
        cb = opts;
        opts = {};
      }

      const saveAndReturn = (err?: Error, Assoc?: any): any => {
        if (!err) {
          Instance[association.name] = Assoc;
        }

        return cb!(err, Assoc);
      };

      if (association.reversed) {
        const modelIds = Array.isArray(Model.id) ? Model.id : [Model.id];
        if (util.hasValues(Instance, modelIds)) {
          if (typeof cb !== "function") {
            return association.model.find(util.getConditions(Model, Object.keys(association.field), Instance), opts);
          }
          association.model.find(util.getConditions(Model, Object.keys(association.field), Instance), opts, saveAndReturn);
        } else {
          cb!(null);
        }
      } else {
        if (Instance.isShell()) {
          Model.get(util.values(Instance, Model.id), (err?: Error, instance?: any) => {
            if (err || !util.hasValues(instance, Object.keys(association.field))) {
              return cb!(null);
            }
            association.model.get(util.values(instance, Object.keys(association.field)), opts, saveAndReturn);
          });
        } else if (util.hasValues(Instance, Object.keys(association.field))) {
          association.model.get(util.values(Instance, Object.keys(association.field)), opts, saveAndReturn);
        } else {
          cb!(null);
        }
      }

      return this;
    },
    enumerable: false,
    writable: true
  });

  Object.defineProperty(Instance, association.setAccessor, {
    value: function (OtherInstance: any, next: Function): any {
      if (association.reversed) {
        Instance.save((err?: Error) => {
          if (err) {
            return next(err);
          }

          if (!Array.isArray(OtherInstance)) {
            util.populateConditions(Model, Object.keys(association.field), Instance, OtherInstance, true);

            return OtherInstance.save({}, { saveAssociations: false }, next);
          }

          const saveAssociation = (otherInstance: any, cb: Function): void => {
            util.populateConditions(Model, Object.keys(association.field), Instance, otherInstance, true);

            otherInstance.save({}, { saveAssociations: false }, cb);
          };

          const associations = _.clone(OtherInstance);
          async.eachSeries(associations, saveAssociation as any, next as any);
        });
      } else {
        OtherInstance.save({}, { saveAssociations: false }, (err?: Error) => {
          if (err) {
            return next(err);
          }

          Instance[association.name] = OtherInstance;

          util.populateConditions(association.model, Object.keys(association.field), OtherInstance, Instance);

          return Instance.save({}, { saveAssociations: false }, next);
        });
      }

      return this;
    },
    enumerable: false,
    writable: true
  });

  if (!association.reversed) {
    Object.defineProperty(Instance, association.delAccessor, {
      value: function (cb: Function): any {
        for (const k in association.field) {
          if (Object.prototype.hasOwnProperty.call(association.field, k)) {
            Instance[k] = null;
          }
        }
        Instance.save({}, { saveAssociations: false }, (err?: Error) => {
          if (!err) {
            delete Instance[association.name];
          }

          return cb();
        });

        return this;
      },
      enumerable: false,
      writable: true
    });
  }

  for (let i = 0; i < ACCESSOR_METHODS.length; i++) {
    const name = ACCESSOR_METHODS[i];
    const asyncNameAccessorName = association[name] + promiseFunctionPostfix;

    if (name === "delAccessor" && !Instance[association.delAccessor]) continue;
    Object.defineProperty(Instance, asyncNameAccessorName, {
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

  if (!Object.prototype.hasOwnProperty.call(opts, "autoFetchLimit") || typeof opts.autoFetchLimit === "undefined") {
    opts.autoFetchLimit = association.autoFetchLimit;
  }

  if (opts.autoFetchLimit === 0 || (!opts.autoFetch && !association.autoFetch)) {
    return cb();
  }

  if (Instance.isPersisted()) {
    Instance[association.getAccessor]({ autoFetchLimit: opts.autoFetchLimit - 1 }, cb);
  } else {
    return cb();
  }
}

function ucfirst(text: string): string {
  return text[0].toUpperCase() + text.substr(1);
}

export default { prepare, extend, autoFetch };
