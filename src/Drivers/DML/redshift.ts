/**
 * Redshift DML driver
 */

import * as util from 'util';
const postgres = require('./postgres');

const resolveWithCallback = <T>(promise: Promise<T>, cb?: (err: Error | null, result?: T) => void): Promise<T> | void => {
  if (typeof cb === "function") {
    promise.then((result) => cb(null, result)).catch((err: Error) => cb(err));
    return;
  }
  return promise;
};

export function Driver(this: any, config: any, connection: any, opts: any): void {
  postgres.Driver.call(this, config, connection, opts);
}

util.inherits(Driver, postgres.Driver);

Driver.prototype.insert = function (
  this: any,
  table: string,
  data: Record<string, any>,
  keyProperties: any[] | null,
  cb?: (err: Error | null, ids?: Record<string, any>) => void
): Promise<Record<string, any>> | void {
  const q = this.query.insert()
    .into(table)
    .set(data)
    .build();

  const promise = (async () => {
    if (this.opts.debug) {
      require("../../Debug").sql('postgres', q);
    }

    await this.execSimpleQuery(q);

    const ids: Record<string, any> = {};

    if (!keyProperties || keyProperties.length === 0) {
      return ids;
    }

    if (keyProperties.length === 1) {
      const results = await this.execSimpleQuery("SELECT LASTVAL() AS id");
      const row = Array.isArray(results) && results.length > 0 ? results[0] : undefined;
      ids[keyProperties[0].name] = row && Object.prototype.hasOwnProperty.call(row, "id") ? row.id : null;
      return ids;
    }

    for (let i = 0; i < keyProperties.length; i++) {
      const prop = keyProperties[i];
      ids[prop.name] = data[prop.mapsTo] !== undefined ? data[prop.mapsTo] : null;
    }

    return ids;
  })();

  return resolveWithCallback(promise, cb);
};

export default Driver;
