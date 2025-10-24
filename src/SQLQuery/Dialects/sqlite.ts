import * as helpers from '../Helpers';
import mysqlDialect from './mysql';
import type { Dialect } from '../types';

const DataTypes: Record<string, string | boolean> = {
  isSQLITE: true,
  id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
  int: 'INTEGER',
  float: 'FLOAT(12,2)',
  bool: 'TINYINT(1)',
  text: 'TEXT'
};

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
    return `'${helpers.dateToString(val, timeZone || 'local', { dialect: 'sqlite' })}'`;
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
      return val(sqliteDialect);
    case 'string':
      break;
    default:
      return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  }

  return `'${val.replace(/'/g, "''")}'`;
}

function escape(query: string, args: any[]): string {
  return helpers.escapeQuery(sqliteDialect, query, args);
}

const sqliteDialect: Dialect = {
  DataTypes,
  escape,
  escapeId: (...ids: any[]) => mysqlDialect.escapeId(...ids),
  escapeVal: (value: any, timeZone?: string) => escapeVal.call(sqliteDialect, value, timeZone),
  defaultValuesStmt: 'DEFAULT VALUES'
};

export default sqliteDialect;
