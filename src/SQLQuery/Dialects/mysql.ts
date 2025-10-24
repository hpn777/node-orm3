import * as helpers from '../Helpers';
import type { Dialect } from '../types';

const DataTypes: Record<string, string> = {
  id: 'INTEGER PRIMARY KEY AUTO_INCREMENT',
  int: 'INTEGER',
  float: 'FLOAT(12,2)',
  bool: 'TINYINT(1)',
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
      return `\`${String(identifier).replace(/`/g, '``')}\``;
    })
    .join('.');
}

function escapeVal(this: Dialect, val: any, timeZone?: string): string {
  if (val === undefined || val === null || typeof val === 'symbol') {
    return 'NULL';
  }

  if (Buffer.isBuffer(val)) {
    return bufferToString(val);
  }

  if (Array.isArray(val)) {
    return arrayToList.call(this, val, timeZone || 'local');
  }

  let value: any = val;

  if (value instanceof Date) {
    value = helpers.dateToString(value, timeZone || 'local', { dialect: 'mysql' });
  } else {
    switch (typeof value) {
      case 'boolean':
        return value ? 'true' : 'false';
      case 'number':
        if (!Number.isFinite(value)) {
          value = value.toString();
          break;
        }
        return String(value);
      case 'object':
        return objectToValues.call(this, value, timeZone || 'Z');
      case 'function':
        return value(mysqlDialect);
      default:
        break;
    }
  }

  const escaped = String(value).replace(/[\0\n\r\b\t\\\'"\x1a]/g, (s: string) => {
    switch (s) {
      case '\0':
        return '\\0';
      case '\n':
        return '\\n';
      case '\r':
        return '\\r';
      case '\b':
        return '\\b';
      case '\t':
        return '\\t';
      case "'":
        return "\\'";
      case '"':
        return '\\"';
      case '\x1a':
        return '\\Z';
      case '\\':
        return '\\\\';
      default:
        return s;
    }
  });

  return `'${escaped}'`;
}

function objectToValues(this: Dialect, object: Record<string, any>, timeZone: string): string {
  const values: string[] = [];

  for (const key in object) {
    if (!Object.prototype.hasOwnProperty.call(object, key)) {
      continue;
    }

    const value = object[key];

    if (typeof value === 'function') {
      continue;
    }

    values.push(`${escapeId.call(this, key)} = ${escapeVal.call(this, value, timeZone)}`);
  }

  return values.join(', ');
}

function arrayToList(this: Dialect, array: any[], timeZone: string): string {
  return `(${array
    .map((value) => {
      if (Array.isArray(value)) {
        return arrayToList.call(this, value, timeZone);
      }
      return escapeVal.call(this, value, timeZone);
    })
    .join(', ')})`;
}

function bufferToString(buffer: Buffer): string {
  let hex: string;

  try {
    hex = buffer.toString('hex');
  } catch (err) {
    const chunks: string[] = [];
    for (let i = 0; i < buffer.length; i += 1) {
      chunks.push(zeroPad(buffer[i].toString(16)));
    }
    hex = chunks.join('');
  }

  return `X'${hex}'`;
}

function zeroPad(value: string): string {
  return value.length === 1 ? `0${value}` : value;
}

function escape(query: string, args: any[]): string {
  return helpers.escapeQuery(mysqlDialect, query, args);
}

const mysqlDialect: Dialect = {
  DataTypes,
  escape,
  escapeId: (...ids: any[]) => escapeId.apply(mysqlDialect, ids),
  escapeVal: (value: any, timeZone?: string) => escapeVal.call(mysqlDialect, value, timeZone),
  defaultValuesStmt: 'VALUES()'
};

export default mysqlDialect;
