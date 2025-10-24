import type { PropertyDefinition } from '../../../types/Core';
import type { Column } from './column';

const BOOLEAN_TRUE = new Set(['1', 'true', 't', 'yes', 'y', 'on']);
const BOOLEAN_FALSE = new Set(['0', 'false', 'f', 'no', 'n', 'off']);

export function mapColumnToProperty(column: Column): PropertyDefinition {
  const normalizedType = normalizeDataType(column.getDataType());
  const property: PropertyDefinition = {};

  if (column.isAutoIncrementing()) {
    property.type = 'serial';
    property.serial = true;
  } else if (isBooleanType(normalizedType)) {
    property.type = 'boolean';
  } else if (isIntegerType(normalizedType)) {
    property.type = 'integer';
  } else if (isNumberType(normalizedType)) {
    property.type = 'number';
  } else if (isDateTimeType(normalizedType)) {
    property.type = 'date';
    property.time = includesTimeComponent(normalizedType);
  } else if (isBinaryType(normalizedType)) {
    property.type = 'binary';
  } else if (isJsonType(normalizedType)) {
    property.type = 'object';
  } else if (normalizedType === 'point') {
    property.type = 'point';
  } else if (normalizedType === 'uuid') {
    property.type = 'uuid';
  } else {
    property.type = 'text';
  }

  const maxLength = column.getMaxLength();
  if (typeof maxLength === 'number' && Number.isFinite(maxLength) && maxLength > 0) {
    property.size = maxLength;
  }

  if (property.type === 'integer' || property.type === 'number') {
    property.rational = property.type === 'number';
  }

  const defaultValue = coerceDefaultValue(column.getDefaultValue(), property.type);
  if (defaultValue !== undefined) {
    property.defaultValue = defaultValue;
  }

  return property;
}

function normalizeDataType(dataType: string): string {
  return (dataType || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function isIntegerType(dataType: string): boolean {
  return (
    dataType.includes('int') && !dataType.includes('point') && !dataType.includes('interval')
  ) || dataType === 'serial' || dataType === 'bigserial' || dataType === 'smallserial';
}

function isNumberType(dataType: string): boolean {
  return (
    dataType.includes('decimal') ||
    dataType.includes('numeric') ||
    dataType.includes('real') ||
    dataType.includes('double') ||
    dataType.includes('float') ||
    dataType === 'money'
  );
}

function isBooleanType(dataType: string): boolean {
  if (dataType === 'boolean' || dataType === 'bool') {
    return true;
  }

  return false;
}

function isDateTimeType(dataType: string): boolean {
  return (
    dataType === 'date' ||
    dataType.includes('timestamp') ||
    dataType.startsWith('datetime') ||
    dataType === 'time' ||
    dataType.startsWith('time ')
  );
}

function includesTimeComponent(dataType: string): boolean {
  if (dataType.includes('timestamp')) {
    return true;
  }

  if (dataType.startsWith('datetime')) {
    return true;
  }

  if (dataType.startsWith('time')) {
    return true;
  }

  return false;
}

function isBinaryType(dataType: string): boolean {
  return (
    dataType.includes('blob') ||
    dataType.includes('binary') ||
    dataType === 'bytea' ||
    dataType === 'varbinary'
  );
}

function isJsonType(dataType: string): boolean {
  return dataType === 'json' || dataType === 'jsonb';
}

function coerceDefaultValue(raw: string | null, type?: string): any | undefined {
  if (raw === null || raw === undefined) {
    return undefined;
  }

  const trimmed = String(raw).trim();
  if (!trimmed.length || trimmed.toUpperCase() === 'NULL') {
    return undefined;
  }

  if (/^nextval\(/i.test(trimmed) || /current_\w+/i.test(trimmed) || /\(.*\)/.test(trimmed)) {
    return undefined;
  }

  switch (type) {
    case 'integer':
    case 'number':
    case 'serial': {
      const numeric = Number(trimmed);
      if (!Number.isNaN(numeric)) {
        return numeric;
      }
      break;
    }
    case 'boolean': {
      const lower = trimmed.toLowerCase();
      if (BOOLEAN_TRUE.has(lower)) {
        return true;
      }
      if (BOOLEAN_FALSE.has(lower)) {
        return false;
      }
      break;
    }
    case 'uuid':
    case 'text': {
      return unquote(trimmed);
    }
    default:
      break;
  }

  return undefined;
}

function unquote(value: string): string {
  if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
    return value.substring(1, value.length - 1).replace(/''/g, "'").replace(/\\"/g, '"');
  }

  return value;
}
