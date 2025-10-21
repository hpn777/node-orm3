/**
 * Shared DML functions
 */

import { promisify } from '../../utils/promises';

export function generateQuery(this: any, sql: string, params: any[]): string {
  return this.query.escape(sql, params);
}

export function execQuery(this: any, ...args: any[]): void {
  let cb: Function;
  let query: string;

  if (args.length === 2) {
    query = args[0];
    cb = args[1];
  } else if (args.length === 3) {
    query = this.generateQuery(args[0], args[1]);
    cb = args[2];
  } else {
    throw new Error('Invalid number of arguments');
  }
  return this.execSimpleQuery(query, cb);
}

export function eagerQuery(this: any, association: any, opts: any, keys: any[], cb: Function): void {
  const desiredKey = Object.keys(association.field);
  const assocKey = Object.keys(association.mergeAssocId);

  const where: Record<string, any> = {};
  where[desiredKey[0]] = keys;

  const query = this.query.select()
    .from(association.model.table)
    .select(opts.only)
    .from(association.mergeTable, assocKey, opts.keys)
    .select(desiredKey).as("$p")
    .where(association.mergeTable, where)
    .build();

  this.execSimpleQuery(query, cb);
}

export const execQueryAsync = promisify(execQuery);
export const eagerQueryAsync = promisify(eagerQuery);

export default {
  generateQuery,
  execQuery,
  eagerQuery,
  execQueryAsync,
  eagerQueryAsync
};
