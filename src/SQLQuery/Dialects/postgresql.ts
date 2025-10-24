import * as helpers from '../Helpers';
import type { Dialect } from '../types';

const DataTypes: Record<string, string> = {
  id: 'SERIAL PRIMARY KEY',
  int: 'INTEGER',
  float: 'REAL',
  bool: 'SMALLINT',
  text: 'TEXT'
};

function escapeId(this: Dialect, ...identifiers: any[]): string {
  return identifiers
    .map((identifier) => {
      if (typeof identifier === 'object' && identifier !== null) {
        return String(identifier.str).replace(/\?:(id|value)/g, (match: string): string => {
          if (match === '?:id') {
            return escapeId.apply(this, [identifier.escapes.shift()]);
          }
          return escapeVal.call(this, identifier.escapes.shift());
        });
      }

      return String(identifier)
        .split('.')
        .map((part) => `"${part.replace(/"/g, '""')}"`)
        .join('.');
    })
    .join('.');
}

function escapeVal(this: Dialect, val: any, timeZone?: string): string {
  if (val === undefined || val === null || typeof val === 'symbol') {
    return 'NULL';
  }

  if (Array.isArray(val)) {
    if (val.length === 1 && Array.isArray(val[0])) {
      return `(${val[0].map((item: any) => escapeVal.call(this, item, timeZone)).join(',')})`;
    }

    return `(${val.map((item: any) => escapeVal.call(this, item, timeZone)).join(', ')})`;
  }

  if (val instanceof Date) {
    return `'${helpers.dateToString(val, timeZone || 'local', { dialect: 'postgresql' })}'`;
  }

  if (Buffer.isBuffer(val)) {
    return `'\\x${val.toString('hex')}'`;
  }

  switch (typeof val) {
    case 'number':
      if (!Number.isFinite(val)) {
        return `'${val.toString()}'`;
      }
      return String(val);
    case 'boolean':
      return val ? 'true' : 'false';
    case 'function':
      return val(postgresqlDialect);
    case 'string':
      break;
    default:
      return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  }

  return `'${val.replace(/'/g, "''")}'`;
}

function escape(query: string, args: any[]): string {
  return helpers.escapeQuery(postgresqlDialect, query, args);
}

const postgresqlDialect: Dialect = {
  DataTypes,
  escape,
  escapeId: (...ids: any[]) => escapeId.apply(postgresqlDialect, ids),
  escapeVal: (value: any, timeZone?: string) => escapeVal.call(postgresqlDialect, value, timeZone),
  defaultValuesStmt: 'DEFAULT VALUES'
};

export default postgresqlDialect;
