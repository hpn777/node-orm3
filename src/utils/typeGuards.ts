/**
 * Type Guards and Runtime Type Checking
 * 
 * Provides type guard functions for runtime type checking and validation.
 * These help ensure type safety at runtime boundaries (e.g., callbacks, external input).
 */

import {
  QueryConditions,
  ValidationError,
  ORMErrorInfo,
  IdentifiableEntity,
  HookMap,
  PropertyDefinition,
  AssociationDefinition,
  DriverResult,
  InstanceData,
} from '../types/Core';

// ==================== Error Checking ====================

/**
 * Check if value is an Error instance
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Check if value is an Error or null
 */
export function isErrorOrNull(value: unknown): value is Error | null {
  return value === null || isError(value);
}

/**
 * Check if object is ORM error info
 */
export function isORMErrorInfo(obj: unknown): obj is ORMErrorInfo {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'code' in obj &&
    'message' in obj &&
    typeof (obj as any).message === 'string'
  );
}

// ==================== Query Checking ====================

/**
 * Check if value is valid query conditions
 */
export function isQueryConditions(obj: unknown): obj is QueryConditions {
  return typeof obj === 'object' && obj !== null;
}

/**
 * Check if value is a valid ID (string, number, or array of them)
 */
export function isValidID(value: unknown): value is string | number | (string | number)[] {
  if (typeof value === 'string' || typeof value === 'number') {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(v => typeof v === 'string' || typeof v === 'number');
  }
  return false;
}

/**
 * Check if object is identifiable entity
 */
export function isIdentifiableEntity(obj: unknown): obj is IdentifiableEntity {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    !Array.isArray(obj) &&
    !(obj instanceof Date)
  );
}

/**
 * Check if object is instance data
 */
export function isInstanceData(obj: unknown): obj is InstanceData {
  return typeof obj === 'object' && obj !== null && !Array.isArray(obj);
}

/**
 * Check if object is driver result
 */
export function isDriverResult(obj: unknown): obj is DriverResult {
  return typeof obj === 'object' && obj !== null && !Array.isArray(obj);
}

// ==================== Hook Checking ====================

/**
 * Check if value is a valid hook map
 */
export function isHookMap(obj: unknown): obj is HookMap {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const hookNames = [
    'beforeCreate',
    'afterCreate',
    'beforeSave',
    'afterSave',
    'beforeValidation',
    'beforeRemove',
    'afterRemove',
    'afterLoad',
    'afterAutoFetch',
  ];

  for (const key in obj) {
    if (!hookNames.includes(key)) {
      return false;
    }
    const value = (obj as any)[key];
    if (value !== undefined && typeof value !== 'function') {
      return false;
    }
  }

  return true;
}

/**
 * Check if value is a function
 */
export function isFunction(value: unknown): value is Function {
  return typeof value === 'function';
}

/**
 * Check if value is a callable
 */
export function isCallable(value: unknown): value is (...args: any[]) => any {
  return typeof value === 'function';
}

// ==================== Validation Checking ====================

/**
 * Check if object is validation error
 */
export function isValidationError(obj: unknown): obj is ValidationError {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'field' in obj &&
    'message' in obj &&
    'rule' in obj &&
    typeof (obj as any).field === 'string' &&
    typeof (obj as any).message === 'string' &&
    typeof (obj as any).rule === 'string'
  );
}

/**
 * Check if object is validation error array
 */
export function isValidationErrorArray(obj: unknown): obj is ValidationError[] {
  return (
    Array.isArray(obj) &&
    obj.every(item => isValidationError(item))
  );
}

// ==================== Property Checking ====================

/**
 * Check if object is property definition
 */
export function isPropertyDefinition(obj: unknown): obj is PropertyDefinition {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const def = obj as any;

  // Type check if present
  if (def.type !== undefined && typeof def.type !== 'string') {
    return false;
  }

  // Key check if present
  if (def.key !== undefined && typeof def.key !== 'boolean') {
    return false;
  }

  // Required check if present
  if (def.required !== undefined && typeof def.required !== 'boolean') {
    return false;
  }

  // Size check if present
  if (def.size !== undefined && typeof def.size !== 'number') {
    return false;
  }

  return true;
}

// ==================== Association Checking ====================

/**
 * Check if object is association definition
 */
export function isAssociationDefinition(obj: unknown): obj is AssociationDefinition {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'name' in obj &&
    'type' in obj &&
    'model' in obj &&
    typeof (obj as any).name === 'string' &&
    typeof (obj as any).type === 'string'
  );
}

// ==================== Array & Collection Checking ====================

/**
 * Check if value is array
 */
export function isArray<T = unknown>(value: unknown): value is T[] {
  return Array.isArray(value);
}

/**
 * Check if array is empty
 */
export function isEmptyArray<T = unknown>(value: unknown): value is T[] {
  return Array.isArray(value) && value.length === 0;
}

/**
 * Check if array has items
 */
export function isNonEmptyArray<T = unknown>(value: unknown): value is T[] {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Check if value is array of strings
 */
export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

/**
 * Check if value is array of numbers
 */
export function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(item => typeof item === 'number');
}

// ==================== Primitive Checking ====================

/**
 * Check if value is string
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Check if value is number
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

/**
 * Check if value is boolean
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Check if value is null
 */
export function isNull(value: unknown): value is null {
  return value === null;
}

/**
 * Check if value is undefined
 */
export function isUndefined(value: unknown): value is undefined {
  return value === undefined;
}

/**
 * Check if value is null or undefined
 */
export function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/**
 * Check if value is truthy
 */
export function isTruthy<T>(value: unknown): value is Exclude<T, null | undefined | false | 0 | ''> {
  return Boolean(value);
}

/**
 * Check if value is falsy
 */
export function isFalsy(value: unknown): value is null | undefined | false | 0 | '' {
  return !value;
}

// ==================== Object Checking ====================

/**
 * Check if value is plain object (not array, Date, etc.)
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !(value instanceof Error) &&
    !(value instanceof RegExp)
  );
}

/**
 * Check if value is plain object with specific keys
 */
export function isObjectWithKeys(
  value: unknown,
  keys: string[]
): value is Record<string, unknown> {
  if (!isPlainObject(value)) {
    return false;
  }

  return keys.every(key => key in value);
}

/**
 * Check if object has a property
 */
export function hasProperty<K extends PropertyKey>(
  obj: unknown,
  key: K
): obj is Record<K, unknown> {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    key in (obj as object)
  );
}

// ==================== Date Checking ====================

/**
 * Check if value is Date
 */
export function isDate(value: unknown): value is Date {
  return value instanceof Date && !isNaN(value.getTime());
}

/**
 * Check if value is valid date string (ISO 8601)
 */
export function isDateString(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const date = new Date(value);
  return !isNaN(date.getTime());
}

/**
 * Check if value is timestamp (milliseconds)
 */
export function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && value > 0 && value < Date.now() * 2;
}

// ==================== Callback Checking ====================

/**
 * Check if value is error callback
 */
export function isErrorCallback(value: unknown): value is (err: Error | null) => void {
  return typeof value === 'function';
}

/**
 * Check if value is result callback
 */
export function isResultCallback<T = unknown>(value: unknown): value is (err: Error | null, result?: T) => void {
  return typeof value === 'function';
}

/**
 * Check if value is void callback
 */
export function isVoidCallback(value: unknown): value is (err: Error | null) => void {
  return typeof value === 'function';
}

// ==================== Export all guards ====================

export default {
  isError,
  isErrorOrNull,
  isORMErrorInfo,
  isQueryConditions,
  isValidID,
  isIdentifiableEntity,
  isInstanceData,
  isDriverResult,
  isHookMap,
  isFunction,
  isCallable,
  isValidationError,
  isValidationErrorArray,
  isPropertyDefinition,
  isAssociationDefinition,
  isArray,
  isEmptyArray,
  isNonEmptyArray,
  isStringArray,
  isNumberArray,
  isString,
  isNumber,
  isBoolean,
  isNull,
  isUndefined,
  isNullish,
  isTruthy,
  isFalsy,
  isPlainObject,
  isObjectWithKeys,
  hasProperty,
  isDate,
  isDateString,
  isTimestamp,
  isErrorCallback,
  isResultCallback,
  isVoidCallback,
};
