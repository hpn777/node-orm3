/**
 * Many-to-Many Associations
 */

import * as _ from 'lodash';
import * as Hook from '../Hook';
import Settings from '../Settings';
import * as Property from '../Property';
import * as ORMError from '../Error';
import * as util from '../Utilities';
import type { HookMap, AssociationType } from '../types/Core';

const ACCESSOR_METHODS = ["hasAccessor", "getAccessor", "setAccessor", "delAccessor", "addAccessor"];

export function prepare(db: any, Model: any, associations: any[]): void {
  Model.hasMany = function (...args: any[]): any {
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
  if (Model.settings.get("instance.cascadeRemove")) {
    Instance.on("beforeRemove", () => {
      Instance[association.delAccessor]();
    });
  }

  const resolveQueryResult = async (result: any): Promise<any> => {
    if (!result) {
      return result;
    }
    if (typeof result.then === 'function') {
      return await result;
    }
    if (typeof result.run === 'function') {
      return await result.run();
    }
    return result;
  };

  const callMaybeCallback = <T>(fn: Function | undefined, context: any, args: any[] = []): Promise<T> => {
    if (typeof fn !== 'function') {
      return Promise.resolve(undefined as unknown as T);
    }

    return new Promise<T>((resolve, reject) => {
      let callbackCalled = false;
      const done = (err?: Error | null, result?: T) => {
        if (callbackCalled) return;
        callbackCalled = true;
        if (err) {
          reject(err);
        } else {
          resolve(result as T);
        }
      };

      const finalArgs = [...args, done];
      let returnValue: any;

      try {
        returnValue = fn.apply(context, finalArgs);
      } catch (err) {
        return reject(err as Error);
      }

      if (returnValue && typeof returnValue.then === 'function') {
        returnValue.then((value: T) => done(null, value)).catch((error: Error) => done(error));
      } else if (fn.length < finalArgs.length) {
        done(null, returnValue as T);
      }
    });
  };

  const callDriverHasMany = async (method: 'has' | 'get' | 'add' | 'del', ...args: any[]): Promise<any> => {
    if (!Driver.hasMany) {
      return undefined;
    }

    const handler = Driver.hasMany(Model, association);
    const fn = handler && handler[method];
    if (typeof fn !== 'function') {
      return undefined;
    }

    return await callMaybeCallback(fn, handler, args);
  };

  const adjustForMapsTo = (options: any): void => {
    for (let i = 0; i < options.__merge.to.field.length; i++) {
      const idProp = association.model.properties[options.__merge.to.field[i]];
      if (idProp && idProp.mapsTo) {
        options.__merge.to.field[i] = idProp.mapsTo;
      }
    }
  };

  const ensureArray = <T>(value: T | T[]): T[] => Array.isArray(value) ? value : [value];

  const disallowCallback = (accessor: string, args: any[]): void => {
    if (args.length === 0) {
      return;
    }

    const potentialCallback = _.last(args);
    if (typeof potentialCallback === 'function') {
      const accessorTarget = association?.model?.modelName || association?.model?.table || association?.name || Model.modelName || Model.table || 'Association';
      throw new TypeError(
        `${accessorTarget}.${accessor} no longer accepts callbacks. Await the returned promise instead.`
      );
    }
  };

  Object.defineProperty(Instance, association.hasAccessor, {
    value: function (...args: any[]): any {
      const instanceArgs = Array.prototype.slice.call(args);
      disallowCallback(association.hasAccessor, instanceArgs);
      const targets = instanceArgs.length === 1 && Array.isArray(instanceArgs[0]) ? instanceArgs[0] : instanceArgs;
      const self = this;

      return (async () => {
        const normalizedTargets = ensureArray(targets).filter((item) => item != null);
        if (normalizedTargets.length === 0) {
          return false;
        }

        const driverResult = await callDriverHasMany('has', self, normalizedTargets, {});
        if (typeof driverResult !== 'undefined') {
          return !!driverResult;
        }

        const options: any = { autoFetchLimit: 0 };
        const conditions: Record<string, any> = {};
        const mergeSelectColumns: string[] = [];
        const mergeSelectMap: Record<string, string> = {};

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
          id: util.values(self, Model.id),
          id_prop: Object.keys(association.mergeId),
          assoc_prop: Object.keys(association.mergeAssocId)
        };

        util.populateConditions(Model, Object.keys(association.mergeId), self, options.__merge.where[1]);
        for (let i = 0; i < normalizedTargets.length; i++) {
          util.populateConditions(association.model, Object.keys(association.mergeAssocId), normalizedTargets[i], options.__merge.where[1], false);
        }

        const finder = association.model.find(conditions, options);
        const foundItems = await resolveQueryResult(finder);

        const rawModelId = association.model?.id;
        const modelKeyFields = Array.isArray(rawModelId)
          ? rawModelId
          : rawModelId
            ? [rawModelId]
            : Object.keys(association.model?.properties || {});
        const comparisonKeys = modelKeyFields.length > 0 ? modelKeyFields : ['id'];

        const mapKeysToString = (item: any): string => comparisonKeys.map((k: string) => String(item?.[k])).join(',');

        const foundItemsIDs = _.chain(foundItems).map(mapKeysToString).uniq().value();
        const targetIDs = _.chain(normalizedTargets).map(mapKeysToString).uniq().value();

        const sameLength = foundItemsIDs.length === targetIDs.length;
        const sameContents = sameLength && _.isEmpty(_.difference(foundItemsIDs, targetIDs));

        return sameContents;
      })();
    },
    enumerable: false,
    writable: true
  });

  Object.defineProperty(Instance, association.getAccessor, {
    value: function (...args: any[]): any {
      const parsedArgs = Array.prototype.slice.call(args);
      disallowCallback(association.getAccessor, parsedArgs);
      const self = this;

      let options: any = {};
      let conditions: any = null;
      let order: any = null;

      for (let i = 0; i < parsedArgs.length; i++) {
        const arg = parsedArgs[i];
        switch (typeof arg) {
          case "object":
            if (Array.isArray(arg)) {
              order = arg;
              order[0] = [association.model.table, order[0]];
            } else {
              if (conditions === null) {
                conditions = arg;
              } else {
                options = arg;
              }
            }
            break;
          case "string":
            if (arg[0] === "-") {
              order = [[association.model.table, arg.substr(1)], "Z"];
            } else {
              order = [[association.model.table, arg]];
            }
            break;
          case "number":
            options.limit = arg;
            break;
        }
      }

      if (order !== null) {
        options.order = order;
      }

      if (conditions === null) {
        conditions = {};
      }

      return (async () => {
        const driverResult = await callDriverHasMany('get', self, conditions, options, createInstance);
        if (typeof driverResult !== 'undefined') {
          self.__opts.associations[association.name].value = driverResult;
          return driverResult;
        }

        const modelIdArray = Array.isArray(association.model.id) ? association.model.id : [association.model.id];
        options.__merge = {
          from: { table: association.mergeTable, field: Object.keys(association.mergeAssocId) },
          to: { table: association.model.table, field: modelIdArray.slice(0) },
          where: [association.mergeTable, {}]
        };

        const mergeSelectColumns: string[] = [];
        const mergeSelectMap: Record<string, string> = {};

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
          id: util.values(self, modelIds),
          id_prop: Object.keys(association.mergeId),
          assoc_prop: Object.keys(association.mergeAssocId)
        };

        util.populateConditions(Model, Object.keys(association.mergeId), self, options.__merge.where[1]);

        const finder = association.model.find(conditions, options);
        const results = await resolveQueryResult(finder);
        self.__opts.associations[association.name].value = results;
        return results;
      })();
    },
    enumerable: false,
    writable: true
  });

  Object.defineProperty(Instance, association.setAccessor, {
    value: function (...args: any[]): any {
      const flatArgs = _.flatten(args);
      disallowCallback(association.setAccessor, flatArgs);
      const targets = flatArgs.length === 1 && Array.isArray(flatArgs[0]) ? flatArgs[0] : flatArgs;
      const self = this;

      return (async () => {
        await self[association.delAccessor]();
        if (targets.length) {
          await self[association.addAccessor](targets);
        }
        return self;
      })();
    },
    enumerable: false,
    writable: true
  });

  Object.defineProperty(Instance, association.delAccessor, {
    value: function (...args: any[]): any {
      const self = this;
      let Associations: any[] = [];

      const argList = Array.prototype.slice.call(args);
      disallowCallback(association.delAccessor, argList);

      for (let i = 0; i < argList.length; i++) {
        switch (typeof argList[i]) {
          case "object":
            if (Array.isArray(argList[i])) {
              Associations = Associations.concat(argList[i]);
            } else if (argList[i].isInstance) {
              Associations.push(argList[i]);
            }
            break;
        }
      }

      return (async () => {
        if (!self.saved()) {
          await self.save();
        }

        const conditions: Record<string, any> = {};
        util.populateConditions(Model, Object.keys(association.mergeId), self, conditions);

        const driverResult = await callDriverHasMany('del', self, Associations);
        if (typeof driverResult !== 'undefined') {
          return driverResult;
        }

        if (Associations.length === 0) {
          await callMaybeCallback(Driver.remove.bind(Driver), Driver, [association.mergeTable, conditions]);
          return self;
        }

        for (let i = 0; i < Associations.length; i++) {
          util.populateConditions(association.model, Object.keys(association.mergeAssocId), Associations[i], conditions, false);
        }

        await callMaybeCallback(Driver.remove.bind(Driver), Driver, [association.mergeTable, conditions]);
        return self;
      })();
    },
    enumerable: false,
    writable: true
  });

  Object.defineProperty(Instance, association.addAccessor, {
    value: function (...args: any[]): any {
      const self = this;
      let Associations: any[] = [];
      let optsArg: any = {};

      const argList = Array.prototype.slice.call(args);
      disallowCallback(association.addAccessor, argList);

      for (let i = 0; i < argList.length; i++) {
        switch (typeof argList[i]) {
          case "object":
            if (Array.isArray(argList[i])) {
              Associations = Associations.concat(argList[i]);
            } else if (argList[i].isInstance) {
              Associations.push(argList[i]);
            } else {
              optsArg = argList[i];
            }
            break;
        }
      }

      return (async () => {
        if (Associations.length === 0) {
          throw new ORMError.ORMError("No associations defined", 'PARAM_MISMATCH', { model: Model.name });
        }

        if (!self.saved()) {
          await self.save();
        }

        const associationIdFields = (() => {
          const rawModelId = association.model?.id;
          if (Array.isArray(rawModelId)) {
            return rawModelId.slice();
          }
          if (rawModelId) {
            return [rawModelId];
          }
          const propertyKeys = Object.keys(association.model?.properties || {});
          return propertyKeys.length > 0 ? propertyKeys : ['id'];
        })();

        const getAssociationIdentity = (item: any): string => {
          return associationIdFields.map((field) => String(item?.[field])).join('|');
        };

        const resolveExistingAssociations = async (): Promise<any[]> => {
          const associationCache = self.__opts?.associations?.[association.name];
          if (associationCache && Array.isArray(associationCache.value)) {
            return associationCache.value;
          }
          const fetched = await self[association.getAccessor]();
          return Array.isArray(fetched) ? fetched : [];
        };

        const existingAssociations = await resolveExistingAssociations();
        const existingKeys = new Set<string>();
        for (const existing of existingAssociations) {
          existingKeys.add(getAssociationIdentity(existing));
        }

        let hasPotentialNewAssociations = false;
        for (const candidate of Associations) {
          if (!candidate || !candidate.isInstance) {
            hasPotentialNewAssociations = true;
            break;
          }
          const candidateKey = getAssociationIdentity(candidate);
          if (!existingKeys.has(candidateKey)) {
            hasPotentialNewAssociations = true;
            break;
          }
        }

        const processedAssociations: any[] = [];
        const newlyAdded: any[] = [];

        for (let i = 0; i < Associations.length; i++) {
          let associationInstance = Associations[i];
          if (!associationInstance.isInstance) {
            associationInstance = new association.model(associationInstance);
          }

          const hookOpts = Object.keys(association.props).length > 0 ? optsArg : undefined;
          await Hook.wait(associationInstance, association.hooks.beforeSave, hookOpts);
          await associationInstance.save({}, { saveAssociations: false });

          const associationKey = getAssociationIdentity(associationInstance);
          if (hasPotentialNewAssociations && existingKeys.has(associationKey)) {
            processedAssociations.push(associationInstance);
            continue;
          }

          const data: Record<string, any> = {};
          for (const k in optsArg) {
            if (k in association.props && Driver.propertyToValue) {
              data[k] = Driver.propertyToValue(optsArg[k], association.props[k]);
            } else {
              data[k] = optsArg[k];
            }
          }

          const driverResult = await callDriverHasMany('add', self, associationInstance, data);
          if (typeof driverResult === 'undefined') {
            util.populateConditions(Model, Object.keys(association.mergeId), self, data);
            util.populateConditions(association.model, Object.keys(association.mergeAssocId), associationInstance, data);
            await callMaybeCallback(Driver.insert.bind(Driver), Driver, [association.mergeTable, data, null]);
          }

          existingKeys.add(associationKey);
          newlyAdded.push(associationInstance);
          processedAssociations.push(associationInstance);
        }

        if (newlyAdded.length > 0) {
          const associationState = self.__opts.associations[association.name];
          if (associationState) {
            const cachedValue = Array.isArray(associationState.value) ? associationState.value.slice() : [];
            const cacheKeys = new Set<string>(cachedValue.map(getAssociationIdentity));
            let cacheChanged = false;
            for (const item of newlyAdded) {
              const key = getAssociationIdentity(item);
              if (!cacheKeys.has(key)) {
                cachedValue.push(item);
                cacheKeys.add(key);
                cacheChanged = true;
              }
            }
            if (cacheChanged) {
              associationState.value = cachedValue;
            }
          }
        }

        return processedAssociations;
      })();
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

  Instance[association.getAccessor]({}, { autoFetchLimit: opts.autoFetchLimit - 1 })
    .then((Assoc: any) => {
      Instance.__opts.associations[association.name].value = Assoc;
    })
    .catch(() => {
      // Ignore auto-fetch errors to preserve legacy behavior
    })
    .finally(() => cb());
}

function ucfirst(text: string): string {
  return text[0].toUpperCase() + text.substr(1).replace(/_([a-z])/, (m, l) => {
    return l.toUpperCase();
  });
}

export default { prepare, extend, autoFetch };
