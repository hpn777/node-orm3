/**
 * Many-to-Many Associations
 */

import * as _ from 'lodash';
import * as async from 'async';
import * as Hook from '../Hook';
import Settings from '../Settings';
import * as Property from '../Property';
import * as ORMError from '../Error';
import * as util from '../Utilities';
import { promisify } from 'util';
import type { HookMap, AssociationType } from '../types/Core';

const ACCESSOR_METHODS = ["hasAccessor", "getAccessor", "setAccessor", "delAccessor", "addAccessor"];

export function prepare(db: any, Model: any, associations: any[]): void {
  Model.hasMany = function (...args: any[]): any {
    const promiseFunctionPostfix = Model.settings.get('promiseFunctionPostfix');
    let name: string | undefined;
    let makeKey: boolean;
    let mergeId: any;
    let mergeAssocId: any;
    let OtherModel: any = Model;
    let props: any = null;
    let opts: any = {};

    for (let i = 0; i < args.length; i++) {
      switch (typeof args[i]) {
        case "string":
          name = args[i];
          break;
        case "function":
          OtherModel = args[i];
          break;
        case "object":
          if (props === null) {
            props = args[i];
          } else {
            opts = args[i];
          }
          break;
      }
    }

    if (props === null) {
      props = {};
    } else {
      for (const k in props) {
        props[k] = Property.normalize({
          prop: props[k], name: k, customTypes: db.customTypes, settings: Model.settings
        });
      }
    }

    makeKey = opts.key || Settings.defaults().hasMany?.key || false;

    mergeId = util.convertPropToJoinKeyProp(
      util.wrapFieldObject({
        field: opts.mergeId, model: Model, altName: Model.table
      }) ||
      util.formatField(Model, Model.table, true, opts.reversed),
      { makeKey: makeKey, required: true }
    );

    mergeAssocId = util.convertPropToJoinKeyProp(
      util.wrapFieldObject({
        field: opts.mergeAssocId, model: OtherModel, altName: name!
      }) ||
      util.formatField(OtherModel, name!, true, opts.reversed),
      { makeKey: makeKey, required: true }
    );

    const assocName = opts.name || ucfirst(name!);
    const assocTemplateName = opts.accessor || assocName;

    const association: any = {
      name: name,
      model: OtherModel || Model,
      props: props,
      hooks: opts.hooks || {},
      autoFetch: opts.autoFetch || false,
      autoFetchLimit: opts.autoFetchLimit || 2,
      field: util.wrapFieldObject({
        field: opts.field, model: OtherModel, altName: Model.table
      }) ||
        util.formatField(Model, name!, true, opts.reversed),
      mergeTable: opts.mergeTable || (Model.table + "_" + name),
      mergeId: mergeId,
      mergeAssocId: mergeAssocId,
      getAccessor: opts.getAccessor || ("get" + assocTemplateName),
      setAccessor: opts.setAccessor || ("set" + assocTemplateName),
      hasAccessor: opts.hasAccessor || ("has" + assocTemplateName),
      delAccessor: opts.delAccessor || ("remove" + assocTemplateName),
      addAccessor: opts.addAccessor || ("add" + assocTemplateName)
    };
    associations.push(association);

    if (opts.reverse) {
      OtherModel.hasMany(opts.reverse, Model, association.props, {
        reversed: true,
        association: opts.reverseAssociation,
        mergeTable: association.mergeTable,
        mergeId: association.mergeAssocId,
        mergeAssocId: association.mergeId,
        field: association.field,
        autoFetch: association.autoFetch,
        autoFetchLimit: association.autoFetchLimit
      });
    }
    return this;
  };
}

export function extend(Model: any, Instance: any, Driver: any, associations: any[], opts: Record<string, unknown>, createInstance: (...args: any[]) => any): void {
  for (let i = 0; i < associations.length; i++) {
    extendInstance(Model, Instance, Driver, associations[i], opts, createInstance);
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

function extendInstance(Model: any, Instance: any, Driver: any, association: any, opts: any, createInstance: Function): void {
  const promiseFunctionPostfix = Model.settings.get('promiseFunctionPostfix');

  if (Model.settings.get("instance.cascadeRemove")) {
    Instance.on("beforeRemove", () => {
      Instance[association.delAccessor]();
    });
  }

  function adjustForMapsTo(options: any): void {
    for (let i = 0; i < options.__merge.to.field.length; i++) {
      const idProp = association.model.properties[options.__merge.to.field[i]];
      if (idProp && idProp.mapsTo) {
        options.__merge.to.field[i] = idProp.mapsTo;
      }
    }
  }

  Object.defineProperty(Instance, association.hasAccessor, {
    value: function (...args: any[]): any {
      let Instances = Array.prototype.slice.apply(args);
      const cb = Instances.pop();
      const conditions: Record<string, any> = {};
      const options: any = {};

      if (Instances.length) {
        if (Array.isArray(Instances[0])) {
          Instances = Instances[0];
        }
      }
      if (Driver.hasMany) {
        return Driver.hasMany(Model, association).has(Instance, Instances, conditions, cb);
      }

      options.autoFetchLimit = 0;
      const mergeSelectColumns: string[] = [];
      const mergeSelectMap: Record<string, string> = {};
      
      // Map property names to their database column names (mapsTo)
      for (const k in association.props) {
        const columnName = association.props[k].mapsTo || k;
        mergeSelectColumns.push(columnName);
        mergeSelectMap[k] = columnName;
      }
      
      options.__merge = {
        from: { table: association.mergeTable, field: Object.keys(association.mergeAssocId) },
        to: { table: association.model.table, field: association.model.id.slice(0) },
        where: [association.mergeTable, {}],
        select: mergeSelectColumns.length > 0 ? mergeSelectColumns : undefined,
        selectMap: mergeSelectMap,
        props: association.props
      };

      adjustForMapsTo(options);

      options.extra = association.props;
      options.extra_info = {
        table: association.mergeTable,
        id: util.values(Instance, Model.id),
        id_prop: Object.keys(association.mergeId),
        assoc_prop: Object.keys(association.mergeAssocId)
      };

      util.populateConditions(Model, Object.keys(association.mergeId), Instance, options.__merge.where[1]);

      for (let i = 0; i < Instances.length; i++) {
        util.populateConditions(association.model, Object.keys(association.mergeAssocId), Instances[i], options.__merge.where[1], false);
      }

      association.model.find(conditions, options, (err?: Error, foundItems?: any[]) => {
        if (err) return cb(err);
        if (_.isEmpty(Instances)) return cb(null, false);

        const mapKeysToString = (item: any): string => {
          return _.map(association.model.keys, (k) => {
            return item[k];
          }).join(',');
        };

        const foundItemsIDs = _.chain(foundItems).map(mapKeysToString).uniq().value();
        const InstancesIDs = _.chain(Instances).map(mapKeysToString).uniq().value();

        const sameLength = foundItemsIDs.length === InstancesIDs.length;
        const sameContents = sameLength && _.isEmpty(_.difference(foundItemsIDs, InstancesIDs));

        return cb(null, sameContents);
      });
      return this;
    },
    enumerable: false,
    writable: true
  });

  Object.defineProperty(Instance, association.getAccessor, {
    value: function (...args: any[]): any {
      let options: any = {};
      let conditions: any = null;
      let order: any = null;
      let cb: Function | null = null;

      for (let i = 0; i < args.length; i++) {
        switch (typeof args[i]) {
          case "function":
            cb = args[i];
            break;
          case "object":
            if (Array.isArray(args[i])) {
              order = args[i];
              order[0] = [association.model.table, order[0]];
            } else {
              if (conditions === null) {
                conditions = args[i];
              } else {
                options = args[i];
              }
            }
            break;
          case "string":
            if (args[i][0] === "-") {
              order = [[association.model.table, args[i].substr(1)], "Z"];
            } else {
              order = [[association.model.table, args[i]]];
            }
            break;
          case "number":
            options.limit = args[i];
            break;
        }
      }

      if (order !== null) {
        options.order = order;
      }

      if (conditions === null) {
        conditions = {};
      }

      if (Driver.hasMany) {
        return Driver.hasMany(Model, association).get(Instance, conditions, options, createInstance, cb);
      }

      const modelIdArray = Array.isArray(association.model.id) ? association.model.id : [association.model.id];
      options.__merge = {
        from: { table: association.mergeTable, field: Object.keys(association.mergeAssocId) },
        to: { table: association.model.table, field: modelIdArray.slice(0) },
        where: [association.mergeTable, {}]
      };

      const mergeSelectColumns: string[] = [];
      const mergeSelectMap: Record<string, string> = {};
      
      // Map property names to their database column names (mapsTo)
      for (const k in association.props) {
        const columnName = association.props[k].mapsTo || k;
        mergeSelectColumns.push(columnName);
        mergeSelectMap[k] = columnName;
      }
      
      if (mergeSelectColumns.length > 0) {
        options.__merge.select = mergeSelectColumns;
        options.__merge.selectMap = mergeSelectMap;
        options.__merge.props = association.props;
      }

      adjustForMapsTo(options);

      const modelIds = Array.isArray(Model.id) ? Model.id : [Model.id];
      options.extra = association.props;
      options.extra_info = {
        table: association.mergeTable,
        id: util.values(Instance, modelIds),
        id_prop: Object.keys(association.mergeId),
        assoc_prop: Object.keys(association.mergeAssocId)
      };

      util.populateConditions(Model, Object.keys(association.mergeId), Instance, options.__merge.where[1]);

      if (cb === null) {
        return association.model.find(conditions, options);
      }

      association.model.find(conditions, options, cb);

      return this;
    },
    enumerable: false,
    writable: true
  });

  Object.defineProperty(Instance, association.setAccessor, {
    value: function (...args: any[]): any {
      const items = _.flatten(args);
      const cb = _.last(items) instanceof Function ? items.pop() : noOperation;

      Instance[association.delAccessor]((err?: Error) => {
        if (err) return cb(err);

        if (items.length) {
          Instance[association.addAccessor](items, cb);
        } else {
          cb(null);
        }
      });

      return this;
    },
    enumerable: false,
    writable: true
  });

  Object.defineProperty(Instance, association.delAccessor, {
    value: function (...args: any[]): any {
      let Associations: any[] = [];
      let cb: Function = noOperation;

      for (let i = 0; i < args.length; i++) {
        switch (typeof args[i]) {
          case "function":
            cb = args[i];
            break;
          case "object":
            if (Array.isArray(args[i])) {
              Associations = Associations.concat(args[i]);
            } else if (args[i].isInstance) {
              Associations.push(args[i]);
            }
            break;
        }
      }
      const conditions: Record<string, any> = {};
      const run = (): void => {
        if (Driver.hasMany) {
          return Driver.hasMany(Model, association).del(Instance, Associations, cb);
        }

        if (Associations.length === 0) {
          return Driver.remove(association.mergeTable, conditions, cb);
        }

        for (let i = 0; i < Associations.length; i++) {
          util.populateConditions(association.model, Object.keys(association.mergeAssocId), Associations[i], conditions, false);
        }

        Driver.remove(association.mergeTable, conditions, cb);
      };

      util.populateConditions(Model, Object.keys(association.mergeId), Instance, conditions);

      if (this.saved()) {
        run();
      } else {
        this.save((err?: Error) => {
          if (err) {
            return cb(err);
          }

          return run();
        });
      }
      return this;
    },
    enumerable: false,
    writable: true
  });

  Object.defineProperty(Instance, association.addAccessor, {
    value: function (...args: any[]): any {
      let Associations: any[] = [];
      let opts: any = {};
      let next: Function = noOperation;

      const run = (): void => {
        const saveAssociation = (Association: any, cb: Function): void => {
          const hookOpts = Object.keys(association.props).length > 0 ? opts : undefined;

          Hook.wait(Association, association.hooks.beforeSave, (err?: Error) => {
            if (err) {
              return cb(err);
            }

            Association.save((err?: Error) => {
              if (err) {
                return cb(err);
              }

              const data: Record<string, any> = {};

              for (const k in opts) {
                if (k in association.props && Driver.propertyToValue) {
                  data[k] = Driver.propertyToValue(opts[k], association.props[k]);
                } else {
                  data[k] = opts[k];
                }
              }

              if (Driver.hasMany) {
                return Driver.hasMany(Model, association).add(Instance, Association, data, (err?: Error) => {
                  if (err) {
                    return cb(err);
                  }

                  return cb();
                });
              }

              util.populateConditions(Model, Object.keys(association.mergeId), Instance, data);
              util.populateConditions(association.model, Object.keys(association.mergeAssocId), Association, data);

              Driver.insert(association.mergeTable, data, null, (err?: Error) => {
                if (err) {
                  return cb(err);
                }

                return cb();
              });
            });
          }, hookOpts);
        };

        async.eachSeries(Associations, saveAssociation as any, (err?: Error | null) => {
          if (err) {
            return next(err);
          }
          next(null, Associations);
        });
      };

      for (let i = 0; i < args.length; i++) {
        switch (typeof args[i]) {
          case "function":
            next = args[i];
            break;
          case "object":
            if (Array.isArray(args[i])) {
              Associations = Associations.concat(args[i]);
            } else if (args[i].isInstance) {
              Associations.push(args[i]);
            } else {
              opts = args[i];
            }
            break;
        }
      }

      if (Associations.length === 0) {
        throw new ORMError.ORMError("No associations defined", 'PARAM_MISMATCH', { model: Model.name });
      }

      if (this.saved()) {
        run();
      } else {
        this.save((err?: Error) => {
          if (err) {
            return next(err);
          }

          return run();
        });
      }

      return this;
    },
    enumerable: false,
    writable: true
  });

  Object.defineProperty(Instance, association.name, {
    get: function () {
      return Instance.__opts.associations[association.name].value;
    },
    set: function (val: any) {
      Instance.__opts.associations[association.name].changed = true;
      Instance.__opts.associations[association.name].value = val;
    },
    enumerable: true
  });

  for (let y = 0; y < ACCESSOR_METHODS.length; y++) {
    const accessorMethodName = ACCESSOR_METHODS[y];
    Object.defineProperty(Instance, association[accessorMethodName] + promiseFunctionPostfix, {
      value: promisify(Instance[association[accessorMethodName]]),
      enumerable: false,
      writable: true
    });
  }
}

function autoFetchInstance(Instance: any, association: any, opts: any, cb: Function): void {
  if (!Instance.saved()) {
    return cb();
  }

  if (!opts.hasOwnProperty("autoFetchLimit") || typeof opts.autoFetchLimit === "undefined") {
    opts.autoFetchLimit = association.autoFetchLimit;
  }

  if (opts.autoFetchLimit === 0 || (!opts.autoFetch && !association.autoFetch)) {
    return cb();
  }

  Instance[association.getAccessor]({}, { autoFetchLimit: opts.autoFetchLimit - 1 }, (err?: Error, Assoc?: any) => {
    if (!err) {
      Instance.__opts.associations[association.name].value = Assoc;
    }

    return cb();
  });
}

function ucfirst(text: string): string {
  return text[0].toUpperCase() + text.substr(1).replace(/_([a-z])/, (m, l) => {
    return l.toUpperCase();
  });
}

function noOperation(): void {
}

export default { prepare, extend, autoFetch };
