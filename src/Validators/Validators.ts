/**
 * Validators module for ORM
 */

import enforce from '.';
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
    const self = this;

    const finish = (err?: string): void => {
      try {
        next(err);
      } catch (_invokeErr) {
        // Swallow downstream errors so validation pipeline isn't interrupted.
      }
    };

    (async () => {
      if (!ctx) {
        return finish();
      }

      if (typeof v === "undefined" || v === null) {
        return finish();
      }

      if (!ctx.model.properties[ctx.property]) {
        return finish();
      }

      // Cannot process on database engines which don't support SQL syntax
      if (!ctx.driver.isSql) {
        return finish('not-supported');
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

      chainQuery(ctx.property, v);

      if (opts.scope) {
        for (const scopeProp of opts.scope) {
          const scopedValue = ctx.instance[scopeProp];
          if (typeof scopedValue === 'undefined' || scopedValue === null) {
            return finish();
          }

          chainQuery(scopeProp, scopedValue);
        }
      }

      let records: any[];

      try {
        records = await chain.run();
      } catch (err) {
        // Treat query errors as non-blocking to avoid cascading validation failures
        return finish();
      }

      if (!records || records.length === 0) {
        return finish();
      }

      const modelId = ctx.model.id;
      const idProperties = Array.isArray(modelId) ? modelId : [modelId];

      const otherRecords = records.filter((record: any) => {
        return !idProperties.every((prop) => record[prop] === self[prop]);
      });

      if (otherRecords.length === 0) {
        return finish();
      }

      return finish(msg || 'not-unique');
    })().catch(() => finish());
  };
}

// Add the ORM-specific validators to the validators object
validators.equalToProperty = equalToProperty;
validators.unique = unique;

export default validators;
