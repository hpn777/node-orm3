/**
 * Redshift DML driver
 */

import { promisify } from 'util';
import * as util from 'util';
const postgres = require('./postgres');

export function Driver(this: any, config: any, connection: any, opts: any): void {
  postgres.Driver.call(this, config, connection, opts);
}

util.inherits(Driver, postgres.Driver);

Driver.prototype.insert = function (this: any, table: string, data: Record<string, any>, keyProperties: any[], cb: Function): void {
  const q = this.query.insert()
    .into(table)
    .set(data)
    .build();

  if (this.opts.debug) {
    require("../../Debug").sql('postgres', q);
  }

  this.execQuery(q, function (this: any, err?: Error, result?: any) {
    if (err) return cb(err);
    if (!keyProperties) return cb(null);

    let i: number;
    const ids: Record<string, any> = {};
    let prop: any;

    if (keyProperties.length === 1) {
      this.execQuery("SELECT LASTVAL() AS id", (err?: Error, results?: any[]) => {
        if (err) return cb(err);

        ids[keyProperties[0].name] = results && results[0].id || null;
        return cb(null, ids);
      });
    } else {
      for (i = 0; i < keyProperties.length; i++) {
        prop = keyProperties[i];
        ids[prop.name] = data[prop.mapsTo] !== undefined ? data[prop.mapsTo] : null;
      }

      return cb(null, ids);
    }
  }.bind(this));
};

Driver.prototype.insertAsync = promisify(Driver.prototype.insert);

export default Driver;
