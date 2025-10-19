/**
 * Helper Types and Utility Types
 * 
 * Advanced TypeScript utility types for better type inference,
 * discriminated unions, and generic constraints.
 */

import { HookMap, PropertyDefinition, ValidationError } from './Core';

// ==================== Discriminated Unions ====================

/**
 * Result of an async operation - either success or failure
 */
export type AsyncResult<T, E extends Error = Error> =
  | { status: 'success'; data: T }
  | { status: 'error'; error: E };

/**
 * Maybe type - value might be present or absent
 */
export type Maybe<T> = T | null | undefined;

/**
 * Nullable version of type
 */
export type Nullable<T> = T | null;

/**
 * Optional version of type
 */
export type Optional<T> = T | undefined;

// ==================== Callback Helpers ====================

/**
 * Convert promise to callback style
 */
export function promiseToCallback<T>(
  promise: Promise<T>,
  callback: (err: Error | null, result?: T) => void
): void {
  promise
    .then(result => callback(null, result))
    .catch(err => callback(err));
}

/**
 * Convert callback to promise
 */
export function callbackToPromise<T>(
  fn: (cb: (err: Error | null, result?: T) => void) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    fn((err, result) => {
      if (err) reject(err);
      else resolve(result!);
    });
  });
}

// ==================== Generic Constraints ====================

/**
 * Extract keys from object that have specific type
 */
export type KeysOfType<T, U> = {
  [K in keyof T]: T[K] extends U ? K : never;
}[keyof T];

/**
 * Extract properties of specific type from object
 */
export type PropertiesOfType<T, U> = {
  [K in KeysOfType<T, U>]: T[K];
};

/**
 * Make all properties required recursively
 */
export type DeepRequired<T> = {
  [P in keyof T]-?: T[P] extends object ? DeepRequired<T[P]> : T[P];
};

/**
 * Make all properties partial recursively
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Make all properties readonly recursively
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

/**
 * Get keys of object that are NOT optional
 */
export type RequiredKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? never : K;
}[keyof T];

/**
 * Get keys of object that ARE optional
 */
export type OptionalKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? K : never;
}[keyof T];

// ==================== Function Helpers ====================

/**
 * Get return type of function
 */
export type ReturnTypeOf<T> = T extends (...args: any[]) => infer R ? R : never;

/**
 * Get parameters of function
 */
export type ParametersOf<T> = T extends (...args: infer P) => any ? P : never;

/**
 * Make function async
 */
export type AsyncFunction<T extends (...args: any[]) => any> = (
  ...args: ParametersOf<T>
) => Promise<ReturnTypeOf<T>>;

// ==================== Array Helpers ====================

/**
 * Array element type
 */
export type ElementOf<T> = T extends (infer E)[] ? E : never;

/**
 * Array with at least one element
 */
export type NonEmptyArray<T> = [T, ...T[]];

/**
 * Tuple of arrays
 */
export type TupleOf<T, N extends number> = N extends N
  ? number extends N
    ? T[]
    : _TupleOf<T, N, []>
  : never;
type _TupleOf<T, N extends number, R extends unknown[]> = R['length'] extends N
  ? R
  : _TupleOf<T, N, [T, ...R]>;

// ==================== Record Helpers ====================

/**
 * Record with all keys of object mapped to specific type
 */
export type RecordOf<T, V> = {
  [K in keyof T]: V;
};

/**
 * Record where values can be T or undefined
 */
export type PartialRecord<K extends PropertyKey, V> = {
  [P in K]?: V;
};

/**
 * Record where values can only be true or false (flags)
 */
export type Flags<K extends PropertyKey> = Record<K, boolean>;

// ==================== Constructor Helpers ====================

/**
 * Constructor function type
 */
export type Constructor<T = {}> = new (...args: any[]) => T;

/**
 * Constructor that takes specific parameters
 */
export type ConstructorOf<T, P extends any[] = any[]> = new (...args: P) => T;

/**
 * Get instance type from constructor
 */
export type InstanceOf<T> = T extends Constructor<infer I> ? I : never;

// ==================== Callable Helpers ====================

/**
 * Function that takes no arguments and returns void
 */
export type Thunk = () => void;

/**
 * Function that takes no arguments and returns a value
 */
export type Supplier<T> = () => T;

/**
 * Function that takes one argument and returns void
 */
export type Consumer<T> = (value: T) => void;

/**
 * Function that takes one argument and returns a value
 */
export type Mapper<T, U> = (value: T) => U;

/**
 * Function that takes two arguments and returns void
 */
export type BiConsumer<T, U> = (first: T, second: U) => void;

/**
 * Function that takes two arguments and returns a value
 */
export type BiMapper<T, U, R> = (first: T, second: U) => R;

/**
 * Function that combines/reduces multiple values
 */
export type Reducer<T, U = T> = (accumulator: U, current: T) => U;

/**
 * Function that filters values
 */
export type Predicate<T> = (value: T) => boolean;

/**
 * Function that compares two values
 */
export type Comparator<T> = (a: T, b: T) => number;

// ==================== Async Helpers ====================

/**
 * Async version of type
 */
export type AsyncOf<T> = T extends Promise<infer U>
  ? Promise<U>
  : Promise<Awaited<T>>;

/**
 * Get awaited type from promise or value
 */
export type Awaited<T> = T extends PromiseLike<infer U> ? Awaited<U> : T;

/**
 * Function that can be async or sync
 */
export type MaybeAsync<T> = T | Promise<T>;

/**
 * Function that returns maybe async result
 */
export type AsyncMaybeMapper<T, U> = (value: T) => MaybeAsync<U>;

// ==================== Model Helpers ====================

/**
 * Create strongly-typed model properties map
 */
export type ModelProperties<T> = {
  [K in keyof T]-?: PropertyDefinition;
};

/**
 * Create strongly-typed hooks map for specific model
 */
export type ModelHooks<_T> = HookMap;

/**
 * Extract readonly properties
 */
export type ReadonlyProperties<T> = {
  [K in keyof T as T[K] extends Readonly<any> ? K : never]: T[K];
};

/**
 * Extract mutable properties
 */
export type MutableProperties<T> = {
  [K in keyof T as T[K] extends Readonly<any> ? never : K]: T[K];
};

// ==================== Validation Helpers ====================

/**
 * Validation result - errors or success
 */
export type ValidationResult<T = unknown> =
  | { valid: true; data?: T }
  | { valid: false; errors: ValidationError[] };

/**
 * Validator function
 */
export type Validator<T> = (value: T) => ValidationResult;

/**
 * Async validator
 */
export type AsyncValidator<T> = (value: T) => Promise<ValidationResult>;

// ==================== Conditional Helpers ====================

/**
 * If type T is assignable to U, then resolve to A, else B
 */
export type If<T, U, A, B> = T extends U ? A : B;

/**
 * If T is never, resolve to A, else B
 */
export type IfNever<T, A, B = T> = [T] extends [never] ? A : B;

/**
 * If T is any, resolve to A, else B
 */
export type IfAny<T, A, B> = 0 extends 1 & T ? A : B;

/**
 * If T is unknown, resolve to A, else B
 */
export type IfUnknown<T, A, B = T> = unknown extends T
  ? T extends unknown
    ? A
    : B
  : B;

// ==================== String Helpers ====================

/**
 * Capitalize first letter
 */
export type Capitalize<S extends string> = S extends `${infer F}${infer R}`
  ? `${Uppercase<F>}${R}`
  : S;

/**
 * Uncapitalize first letter
 */
export type Uncapitalize<S extends string> = S extends `${infer F}${infer R}`
  ? `${Lowercase<F>}${R}`
  : S;

/**
 * CamelCase to snake_case
 */
export type ToSnakeCase<S extends string> = S extends `${infer F}${infer R}`
  ? F extends Uppercase<F>
    ? `_${Lowercase<F>}${ToSnakeCase<R>}`
    : `${F}${ToSnakeCase<R>}`
  : S;

// ==================== Export ====================

export default {
  // All types and helpers exported
};
