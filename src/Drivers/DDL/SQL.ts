/**
 * SQL DDL operations
 */

import * as _ from 'lodash';
const sqlDdlSync = require('sql-ddl-sync');
const Sync = sqlDdlSync.Sync;

export interface SyncOptions {
  table: string;
  allProperties: Record<string, any>;
  many_associations: any[];
}

export function sync(this: any, opts: SyncOptions, cb: (err?: Error) => void): any {
  const syncInstance = new Sync({
    driver: this,
    debug: false
  });

  const setIndex = (p: Record<string, any>, v: any, k: string): void => {
    v.index = true;
    p[k] = v;
  };

  if (this.customTypes) {
    for (const k in this.customTypes) {
      syncInstance.defineType(k, this.customTypes[k]);
    }
  }

  syncInstance.defineCollection(opts.table, opts.allProperties);

  for (let i = 0; i < opts.many_associations.length; i++) {
    let props: Record<string, any> = {};

    _.merge(props, opts.many_associations[i].mergeId);
    _.merge(props, opts.many_associations[i].mergeAssocId);
    props = _.transform(props, setIndex);
    _.merge(props, opts.many_associations[i].props);

    syncInstance.defineCollection(opts.many_associations[i].mergeTable, props);
  }

  syncInstance.sync(cb);

  return this;
}

export function drop(this: any, opts: SyncOptions, cb: (err?: Error) => void): any {
  let i: number;
  const queries: string[] = [];
  let pending: number;

  queries.push("DROP TABLE IF EXISTS " + this.query.escapeId(opts.table));

  for (i = 0; i < opts.many_associations.length; i++) {
    queries.push("DROP TABLE IF EXISTS " + this.query.escapeId(opts.many_associations[i].mergeTable));
  }

  pending = queries.length;

  for (i = 0; i < queries.length; i++) {
    this.execQuery(queries[i], (err?: Error) => {
      if (--pending === 0) {
        return cb(err);
      }
    });
  }

  return this;
}

export default { sync, drop };
