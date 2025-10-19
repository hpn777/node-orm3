/**
 * Validators module for ORM
 */

import enforce from './shims/enforce';
import * as util from 'util';

export type ValidatorFunction = (v: any, next: (err?: string) => void, ctx?: any) => void;

export const validators = {
  required: enforce.required,
  notEmptyString: enforce.notEmptyString,
  rangeNumber: enforce.ranges.number,
  rangeLength: enforce.ranges.length,
  insideList: enforce.lists.inside,
  outsideList: enforce.lists.outside,
  password: enforce.security.password,
  patterns: enforce.patterns,
  equalToProperty: null as any,  // Will be set below
  unique: null as any,  // Will be set below
};

/**
 * Check if a value is the same as a value
 * of another property (useful for password
 * checking).
 **/
export function equalToProperty(name: string, msg?: string): ValidatorFunction {
  return function (this: any, v: any, next: (err?: string) => void): void {
    if (v === this[name]) {
      return next();
    }
    return next(msg || 'not-equal-to-property');
  };
}

interface UniqueOptions {
  ignoreCase?: boolean;
  scope?: string[];
}

interface ValidationContext {
  driver: any;
  model: any;
  property: string;
  instance: any;
}

/**
 * Check if a property is unique in the collection.
 * This can take a while because a query has to be made against the Model.
 *
 * Due to the async nature of node, and concurrent web server environments,
 * an index on the database column is the only way to guarantee uniqueness.
 *
 * For sensibility's sake, undefined and null values are ignored for uniqueness
 * checks.
 *
 * Options:
 *   ignoreCase: for postgres; mysql ignores case by default.
 *   scope: (Array) scope uniqueness to listed properties
 **/
export function unique(...args: Array<string | UniqueOptions>): ValidatorFunction {
  let msg: string | null = null;
  let opts: UniqueOptions = {};

  for (const arg of args) {
    if (typeof arg === "string") {
      msg = arg;
    } else if (typeof arg === "object") {
      opts = arg;
    }
  }

  return function (this: any, v: any, next: (err?: string) => void, ctx?: ValidationContext): void {
    if (!ctx) {
      return next();
    }

    if (typeof v === "undefined" || v === null) {
      return next();
    }

    // Cannot process on database engines which don't support SQL syntax
    if (!ctx.driver.isSql) {
      return next('not-supported');
    }

    const chain = ctx.model.find();

    const chainQuery = (prop: string, value: any): void => {
      let query: any = null;

      if (opts.ignoreCase === true && ctx.model.properties[prop] && ctx.model.properties[prop].type === 'text') {
        query = util.format('LOWER(%s.%s) LIKE LOWER(?)',
          ctx.driver.query.escapeId(ctx.model.table), ctx.driver.query.escapeId(prop)
        );
        chain.where(query, [value]);
      } else {
        query = {};
        query[prop] = value;
        chain.where(query);
      }
    };

    const handler = (err: Error | null, records?: any[]): void => {
      if (err) {
        return next();
      }
      if (!records || records.length === 0) {
        return next();
      }
      if (records.length === 1 && records[0][ctx.model.id] === this[ctx.model.id]) {
        return next();
      }
      return next(msg || 'not-unique');
    };

    // Skip validation if the property doesn't exist in the model schema
    if (!ctx.model.properties[ctx.property]) {
      return next();
    }

    chainQuery(ctx.property, v);

    if (opts.scope) {
      for (const scopeProp of opts.scope) {
        // In SQL unique index land, NULL values are not considered equal.
        if (typeof ctx.instance[scopeProp] === 'undefined' || ctx.instance[scopeProp] === null) {
          return next();
        }

        chainQuery(scopeProp, ctx.instance[scopeProp]);
      }
    }

    chain.all(handler.bind(this));
  };
}

// Add the ORM-specific validators to the validators object
validators.equalToProperty = equalToProperty;
validators.unique = unique;

export default validators;
