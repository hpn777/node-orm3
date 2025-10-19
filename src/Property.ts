/**
 * Property normalization and management
 */

import * as _ from 'lodash';
import { ORMError } from './Error';
import { Property as PropertyType, PropertyDefinition } from './types';

const KNOWN_TYPES = [
  "text", "number", "integer", "boolean", "date", "enum", "object",
  "binary", "point", "serial", "uuid"
];

interface NormalizeOptions {
  name: string;
  prop: PropertyDefinition | string | any[] | Function;
  customTypes: Record<string, any>;
  settings: any;
}

export function normalize(opts: NormalizeOptions): PropertyType {
  // Handle constructor functions
  if (typeof opts.prop === "function") {
    switch (opts.prop.name) {
      case "String":
        opts.prop = { type: "text" };
        break;
      case "Number":
        opts.prop = { type: "number" };
        break;
      case "Boolean":
        opts.prop = { type: "boolean" };
        break;
      case "Date":
        opts.prop = { type: "date" };
        break;
      case "Object":
        opts.prop = { type: "object" };
        break;
      case "Buffer":
        opts.prop = { type: "binary" };
        break;
    }
  } else if (typeof opts.prop === "string") {
    // Handle string type
    const tmp = opts.prop;
    opts.prop = {};
    opts.prop.type = tmp;
  } else if (Array.isArray(opts.prop)) {
    // Handle enum arrays
    opts.prop = { type: "enum", values: opts.prop };
  } else {
    // Clone the property object
    opts.prop = _.cloneDeep(opts.prop);
  }

  const prop = opts.prop as PropertyDefinition;

  // Validate type
  const propType = prop.type as string;
  if (propType && KNOWN_TYPES.indexOf(propType) === -1 && !(propType in opts.customTypes)) {
    throw new ORMError(`Unknown property type: ${propType}`, 'NO_SUPPORT');
  }

  // Set default required value
  if (!prop.hasOwnProperty("required") && opts.settings.get("properties.required")) {
    prop.required = true;
  }

  // Defaults to true. Setting to false hides properties from JSON.stringify(modelInstance).
  if (!prop.hasOwnProperty("enumerable") || prop.enumerable === true) {
    prop.enumerable = true;
  }

  // Defaults to true. Rational means floating point here.
  if (prop.type === "number" && prop.rational === undefined) {
    prop.rational = true;
  }

  // Set mapsTo default
  if (!('mapsTo' in prop)) {
    prop.mapsTo = opts.name;
  }

  // Convert rational=false number to integer
  if (prop.type === "number" && prop.rational === false) {
    prop.type = "integer";
    delete prop.rational;
  }

  // Set property name
  (prop as any).name = opts.name;

  return prop as PropertyType;
}

export default { normalize };
