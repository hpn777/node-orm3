/**
 * Shared DML functions
 */

export function generateQuery(this: any, sql: string, params: any[]): string {
  return this.query.escape(sql, params);
}

export function execQuery(this: any, ...args: any[]): Promise<any> | void {
  let cb: Function | undefined;
  let query: string;

  if (args.length === 1) {
    query = args[0];
  } else if (args.length === 2) {
    if (typeof args[1] === 'function') {
      query = args[0];
      cb = args[1];
    } else {
      query = this.generateQuery(args[0], args[1]);
    }
  } else if (args.length === 3) {
    query = this.generateQuery(args[0], args[1]);
    cb = args[2];
  } else {
    throw new Error('Invalid number of arguments');
  }

  return this.execSimpleQuery(query, cb);
}

export function eagerQuery(this: any, association: any, opts: any, keys: any[], cb?: Function): Promise<any> | void {
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

  if (typeof cb === 'function') {
    this.execSimpleQuery(query, cb);
    return;
  }

  return this.execSimpleQuery(query);
}

export default {
  generateQuery,
  execQuery,
  eagerQuery
};
