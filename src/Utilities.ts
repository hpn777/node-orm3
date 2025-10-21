/**
 * Utility functions for ORM
 */

import * as _ from 'lodash';
import * as path from 'path';
import { Buffer } from 'buffer';
import pathIsAbsolute from 'path-is-absolute';
import { Property } from './types/Core';

const Query: any = require('sql-query');

interface OneAssociation {
  name: string;
  model: Model;
  field: Record<string, any>;
}

interface Model {
  uid?: string;
  id: string[];
  properties: Record<string, Property>;
  settings: Record<string, any>;
}

/**
 * Order should be a String (with the property name assumed ascending)
 * or an Array or property String names.
 *
 * Examples:
 *
 * 1. 'property1' (ORDER BY property1 ASC)
 * 2. '-property1' (ORDER BY property1 DESC)
 * 3. [ 'property1' ] (ORDER BY property1 ASC)
 * 4. [ '-property1' ] (ORDER BY property1 DESC)
 * 5. [ 'property1', 'A' ] (ORDER BY property1 ASC)
 * 6. [ 'property1', 'Z' ] (ORDER BY property1 DESC)
 * 7. [ '-property1', 'A' ] (ORDER BY property1 ASC)
 * 8. [ 'property1', 'property2' ] (ORDER BY property1 ASC, property2 ASC)
 * 9. [ 'property1', '-property2' ] (ORDER BY property1 ASC, property2 DESC)
 * ...
 */
export function standardizeOrder(order: string | string[]): Array<[string, string]> {
  if (typeof order === "string") {
    if (order[0] === "-") {
      return [[order.substr(1), "Z"]];
    }
    return [[order, "A"]];
  }

  const new_order: Array<[string, string]> = [];
  let minus: boolean;

  for (let i = 0; i < order.length; i++) {
    minus = (order[i][0] === "-");

    if (i < order.length - 1 && ["A", "Z"].indexOf(order[i + 1].toUpperCase()) >= 0) {
      new_order.push([
        (minus ? order[i].substr(1) : order[i]),
        order[i + 1]
      ]);
      i += 1;
    } else if (minus) {
      new_order.push([order[i].substr(1), "Z"]);
    } else {
      new_order.push([order[i], "A"]);
    }
  }

  return new_order;
}

/**
 * Operations
 * A) Build an index of associations, with their name as the key
 * B) Check for any conditions with a key in the association index
 * C) Ensure that our condition supports array values
 * D) Remove original condition (not DB compatible)
 * E) Convert our association fields into an array, indexes are the same as model.id
 * F) Iterate through values for the condition, only accept instances of the same type as the association
 */
export function checkConditions(
  conditions: Record<string, any>,
  one_associations: OneAssociation[]
): Record<string, any> {
  // A) Build an index of associations
  const associations: Record<string, OneAssociation> = {};
  for (let i = 0; i < one_associations.length; i++) {
    associations[one_associations[i].name] = one_associations[i];
  }

  for (const k in conditions) {
    // B) Check if key is in association index
    if (!associations.hasOwnProperty(k)) continue;

    // C) Ensure condition supports array values
    let values = conditions[k];
    if (!Array.isArray(values)) values = [values];

    // D) Remove original condition (not DB compatible)
    delete conditions[k];

    // E) Convert association fields into an array
    const association_fields = Object.keys(associations[k].field);
    const model = associations[k].model;

    // F) Iterate through values
    for (let i = 0; i < values.length; i++) {
      if (values[i].isInstance && values[i].model().uid === model.uid) {
        if (association_fields.length === 1) {
          if (typeof conditions[association_fields[0]] === 'undefined') {
            conditions[association_fields[0]] = values[i][model.id[0]];
          } else if (Array.isArray(conditions[association_fields[0]])) {
            conditions[association_fields[0]].push(values[i][model.id[0]]);
          } else {
            conditions[association_fields[0]] = [conditions[association_fields[0]], values[i][model.id[0]]];
          }
        } else {
          const _conds: Record<string, any> = {};
          for (let j = 0; j < association_fields.length; j++) {
            _conds[association_fields[j]] = values[i][model.id[j]];
          }

          conditions.or = conditions.or || [];
          conditions.or.push(_conds);
        }
      }
    }
  }

  return conditions;
}

const comparatorMap: Record<string, (value: any) => any> = {
  '>': (value: any) => Query.gt(value),
  gt: (value: any) => Query.gt(value),
  '>=': (value: any) => Query.gte(value),
  gte: (value: any) => Query.gte(value),
  '<': (value: any) => Query.lt(value),
  lt: (value: any) => Query.lt(value),
  '<=': (value: any) => Query.lte(value),
  lte: (value: any) => Query.lte(value),
  '!': (value: any) => Query.ne(value),
  '!=': (value: any) => Query.ne(value),
  ne: (value: any) => Query.ne(value),
  between: (value: any) => Array.isArray(value) ? Query.between(value[0], value[1]) : Query.between(value.from, value.to),
  not_between: (value: any) => Array.isArray(value) ? Query.not_between(value[0], value[1]) : Query.not_between(value.from, value.to),
  not_in: (value: any) => Query.not_in(value)
};

const logicalKeys = new Set(['or', 'and', 'not', 'not_or', 'not_and']);

function normalizeConditionValue(value: any): any {
  if (value == null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeConditionValue);
  }

  if (typeof value !== 'object') {
    return value;
  }

  if ((value as Record<string, unknown>).hasOwnProperty('sql_comparator')) {
    return value;
  }

  if (value instanceof Date) {
    return value;
  }

  if (Buffer.isBuffer(value)) {
    return value;
  }

  const keys = Object.keys(value);

  if (keys.length === 1) {
    const key = keys[0];
    const comparatorFn = comparatorMap[key];
    if (comparatorFn) {
      const normalizedOperand = normalizeConditionValue((value as any)[key]);
      return comparatorFn(normalizedOperand);
    }
  }

  if (keys.some((key) => logicalKeys.has(key))) {
    const result: Record<string, any> = {};
    for (const key of keys) {
      const entry = (value as any)[key];
      if (Array.isArray(entry)) {
        result[key] = entry.map(normalizeConditionValue);
      } else {
        result[key] = normalizeConditionValue(entry);
      }
    }
    return result;
  }

  const normalized: Record<string, any> = {};
  for (const key of keys) {
    normalized[key] = normalizeConditionValue((value as any)[key]);
  }

  return normalized;
}

/**
 * Gets all the values within an object or array, optionally
 * using a keys array to get only specific values
 */
export function values(obj: Record<string, any> | any[], keys?: string[]): any[] {
  const vals: any[] = [];

  if (keys) {
    for (let i = 0; i < keys.length; i++) {
      vals.push((obj as any)[keys[i]]);
    }
  } else if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      vals.push(obj[i]);
    }
  } else {
    for (const k in obj) {
      if (!/[0-9]+/.test(k)) {
        vals.push(obj[k]);
      }
    }
  }
  return vals;
}

// Qn:       is Zero a valid value for a FK column?
// Why?      Well I've got a pre-existing database that started all its 'serial' IDs at zero...
// Answer:   hasValues() is only used in hasOne association, so it's probably ok...
export function hasValues(obj: Record<string, any>, keys: string[]): boolean {
  for (let i = 0; i < keys.length; i++) {
    if (!obj[keys[i]] && obj[keys[i]] !== 0) return false;  // 0 is also a good value...
  }
  return true;
}

export function populateConditions(
  model: Model,
  fields: string[],
  source: Record<string, any>,
  target: Record<string, any>,
  overwrite?: boolean
): void {
  const modelIds = Array.isArray(model.id) ? model.id : [model.id];
  for (let i = 0; i < modelIds.length; i++) {
    if (typeof target[fields[i]] === 'undefined' || overwrite !== false) {
      target[fields[i]] = source[modelIds[i]];
    } else if (Array.isArray(target[fields[i]])) {
      target[fields[i]].push(source[modelIds[i]]);
    } else {
      target[fields[i]] = [target[fields[i]], source[modelIds[i]]];
    }
  }
}

export function getConditions(model: Model, fields: string[], from: Record<string, any>): Record<string, any> {
  const conditions: Record<string, any> = {};

  populateConditions(model, fields, from, conditions);

  return conditions;
}

interface WrapFieldObjectParams {
  field?: string | Record<string, any>;
  model: Model;
  altName: string;
  mapsTo?: string;
}

export function wrapFieldObject(params: WrapFieldObjectParams): Record<string, Property> {
  if (!params.field) {
    const assoc_key = params.model.settings.get("properties.association_key");
    const modelIdField = Array.isArray(params.model.id) ? params.model.id[0] : params.model.id;

    if (typeof assoc_key === "function") {
      params.field = assoc_key(params.altName.toLowerCase(), modelIdField);
    } else {
      params.field = assoc_key.replace("{name}", params.altName.toLowerCase())
        .replace("{field}", modelIdField);
    }
  }

  if (typeof params.field === 'object') {
    for (const k in params.field) {
      if (!/[0-9]+/.test(k) && params.field.hasOwnProperty(k)) {
        return params.field as Record<string, Property>;
      }
    }
  }

  const newObj: Record<string, Property> = {};
  let newProp: Partial<Property>;
  const propPreDefined = params.model.properties[params.field as string];
  const modelIdField = Array.isArray(params.model.id) ? params.model.id[0] : params.model.id;
  const propFromKey = params.model.properties[modelIdField];
  newProp = { type: 'integer' } as Partial<Property>;

  const prop: Property = _.cloneDeep(propPreDefined || propFromKey || newProp) as Property;

  if (!propPreDefined) {
    _.extend(prop, {
      name: params.field, 
      mapsTo: params.mapsTo || params.field
    });
  }

  newObj[params.field as string] = prop;

  return newObj;
}

export function formatField(
  model: Model,
  name: string,
  required: boolean,
  reversed?: boolean
): Record<string, Property> {
  const fields: Record<string, Property> = {};
  const keys = Array.isArray(model.id) ? model.id : [model.id];
  const assoc_key = model.settings.get("properties.association_key");

  for (let i = 0; i < keys.length; i++) {
    let field_name: string;

    if (reversed) {
      field_name = keys[i];
    } else if (typeof assoc_key === "function") {
      field_name = assoc_key(name.toLowerCase(), keys[i]);
    } else {
      field_name = assoc_key.replace("{name}", name.toLowerCase())
        .replace("{field}", keys[i]);
    }

    let field_opts: Property;

    if (model.properties.hasOwnProperty(keys[i])) {
      const p = model.properties[keys[i]];

      field_opts = {
        type: p.type || "integer",
        size: p.size || 4,
        unsigned: p.unsigned || true,
        time: p.time || false,
        big: p.big || false,
        values: p.values || undefined,
        required: required,
        name: field_name,
        mapsTo: field_name,
        key: false,
        unique: false,
        enumerable: true,
      } as Property;
    } else {
      field_opts = {
        type: "integer",
        unsigned: true,
        size: 4,
        required: required,
        name: field_name,
        mapsTo: field_name,
        key: false,
        unique: false,
        enumerable: true,
      } as Property;
    }

    fields[field_name] = field_opts;
  }

  return fields;
}

interface ConvertPropOptions {
  required: boolean;
  makeKey?: boolean;
}

// If the parent associations key is `serial`, the join tables
// key should be changed to `integer`.
export function convertPropToJoinKeyProp(
  props: Record<string, Property>,
  opts: ConvertPropOptions
): Record<string, Property> {
  for (const k in props) {
    const prop = props[k];

    prop.required = opts.required;

    if (prop.type === 'serial') {
      prop.type = 'integer';
    }
    if (opts.makeKey) {
      prop.key = true;
    } else {
      prop.key = false;
    }
  }

  return props;
}

export function getRealPath(path_str: string, stack_index?: number): string {
  const cwd = process.cwd();
  const err = new Error();
  const stackLines = err.stack?.split(/\r?\n/) || [];
  const tmp = stackLines[typeof stack_index !== "undefined" ? stack_index : 3];
  
  let actualCwd = cwd;

  if (tmp) {
    let m = tmp.match(/^\s*at\s+(.+):\d+:\d+$/);
    if (m !== null) {
      actualCwd = path.dirname(m[1]);
    } else if ((m = tmp.match(/^\s*at\s+module\.exports\s+\((.+?)\)/)) !== null) {
      actualCwd = path.dirname(m[1]);
    } else if ((m = tmp.match(/^\s*at\s+.+\s+\((.+):\d+:\d+\)$/)) !== null) {
      actualCwd = path.dirname(m[1]);
    }
  }

  if (!pathIsAbsolute(path_str)) {
    path_str = path.join(actualCwd, path_str);
  }
  if (path_str.substr(-1) === path.sep) {
    path_str += "index";
  }

  return path_str;
}

export function transformPropertyNames(
  dataIn: Record<string, any>,
  properties: Record<string, Property>
): Record<string, any> {
  const dataOut: Record<string, any> = {};

  for (const k in dataIn) {
    const normalizedValue = normalizeConditionValue(dataIn[k]);
    const prop = properties[k];
    if (prop) {
      dataOut[prop.mapsTo] = normalizedValue;
    } else {
      dataOut[k] = normalizedValue;
    }
  }
  return dataOut;
}

export function transformOrderPropertyNames(
  order: Array<[string, string] | [string[], string]>,
  properties: Record<string, Property>
): Array<[string, string] | [string[], string]> {
  if (!order) return order;

  const newOrder = JSON.parse(JSON.stringify(order));

  // Rename order properties according to mapsTo
  for (let i = 0; i < newOrder.length; i++) {
    const item = newOrder[i];

    // orderRaw
    if (Array.isArray(item[1])) continue;

    if (Array.isArray(item[0])) {
      // order on a hasMany
      // [ ['modelName', 'propName'], 'Z']
      const prop = properties[item[0][1]];
      if (prop && prop.mapsTo) {
        item[0][1] = prop.mapsTo;
      }
    } else {
      // normal order
      const prop = properties[item[0]];
      if (prop && prop.mapsTo) {
        item[0] = prop.mapsTo;
      }
    }
  }
  return newOrder;
}

export function renameDatastoreFieldsToPropertyNames(
  data: Record<string, any>,
  fieldToPropertyMap: Record<string, Property>
): Record<string, any> {
  for (const k in data) {
    const prop = fieldToPropertyMap[k];
    if (prop && prop.name !== k) {
      data[prop.name] = data[k];
      delete data[k];
    }
  }
  return data;
}
