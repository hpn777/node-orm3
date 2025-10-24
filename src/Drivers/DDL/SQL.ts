/**
 * SQL DDL operations
 */

import * as _ from 'lodash';
import { Sync } from './sync';
import type { MetadataInspector, MetadataOptions } from './meta';
import { MysqlMetadataDriver } from './meta/mysql/metadata';
import { PostgresMetadataDriver } from './meta/postgresql/metadata';
import { SqliteMetadataDriver } from './meta/sqlite/metadata';

export interface SyncOptions {
  table: string;
  allProperties: Record<string, any>;
  many_associations: any[];
}

type MetadataDriverInstance =
  | MysqlMetadataDriver
  | PostgresMetadataDriver
  | SqliteMetadataDriver;

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

  syncInstance.sync((err?: Error | null) => {
    cb(err === null ? undefined : err);
  });

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

export function getMetadata(this: any, options?: MetadataOptions): MetadataInspector {
  const cacheKey = options?.schema ?? '__default__';
  const cache: Map<string, MetadataDriverInstance> = this.__metadataCache ?? new Map();

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)!;
  }

  const inspector = createMetadataDriver(this, options?.schema);
  cache.set(cacheKey, inspector);
  this.__metadataCache = cache;

  return inspector;
}

function createMetadataDriver(driver: any, schema?: string): MetadataDriverInstance {
  switch (driver.dialect) {
    case 'mysql':
      return new MysqlMetadataDriver(driver, schema);
    case 'postgres':
    case 'postgresql':
      return new PostgresMetadataDriver(driver, schema);
    case 'sqlite':
      return new SqliteMetadataDriver(driver);
    default:
      throw new Error(`Metadata inspection is not supported for dialect '${driver.dialect}'`);
  }
}

export default { sync, drop, getMetadata };
