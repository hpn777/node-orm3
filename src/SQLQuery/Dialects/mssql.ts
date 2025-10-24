import * as helpers from '../Helpers';
import type { Dialect } from '../types';

const DataTypes: Record<string, string> = {
  id: 'INT IDENTITY(1,1) NOT NULL PRIMARY KEY',
  int: 'INT',
  float: 'FLOAT',
  bool: 'BIT',
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
      return `[${identifier}]`;
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
    return `'${helpers.dateToString(val, timeZone || 'local', { dialect: 'mssql' })}'`;
  }

  if (Buffer.isBuffer(val)) {
    return `X'${val.toString('hex')}'`;
  }

  switch (typeof val) {
    case 'number':
      if (!Number.isFinite(val)) {
        return `'${val.toString()}'`;
      }
      return String(val);
    case 'boolean':
      return val ? '1' : '0';
    case 'function':
      return val(mssqlDialect);
    case 'string':
      break;
    default:
      return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  }

  return `'${val.replace(/'/g, "''")}'`;
}

function escape(query: string, args: any[]): string {
  return helpers.escapeQuery(mssqlDialect, query, args);
}

const mssqlDialect: Dialect = {
  DataTypes,
  escape,
  escapeId: (...ids: any[]) => escapeId.apply(mssqlDialect, ids),
  escapeVal: (value: any, timeZone?: string) => escapeVal.call(mssqlDialect, value, timeZone),
  defaultValuesStmt: 'DEFAULT VALUES',
  limitAsTop: true
};

export default mssqlDialect;
