/**
 * Core Type Definitions for node-orm3
 * 
 * Central type definitions for hooks, validation, associations,
 * queries, connections, and properties. This file replaces scattered `any`
 * types throughout the codebase.
 *
 * All callback-based patterns have been converted to promise-based for async/await.
 */

import type { ChainInstanceCalls } from '../ChainInstance';

// ==================== Hook Types ====================

/**
 * Hook function that is promise-based
 * Hooks should return a Promise that resolves when the hook is complete
 */
export type HookFunction = () => Promise<void>;

/**
 * Hook function with options parameter
 */
export type HookFunctionWithOptions<T = unknown> = (
  options: T
) => Promise<void>;

/**
 * Registry of all available hooks for a model
 */
export type HookMap = Record<string, HookFunction | undefined>;

/**
 * Hook callback for internal use (will be converted to promise-based)
 */
export type HookCallback = (err?: Error | null) => void;

// ==================== Validation Types ====================

/**
 * Result of a single validation error
 */
export interface ValidationError {
  field: string;
  message: string;
  rule: string;
  value?: unknown;
}

/**
 * Validator function signature - now promise-based
 */
export type Validator<T = unknown> = (
  value: T
) => Promise<void | Error>;

/**
 * Validation result - either success (null) or array of errors
 */
export type ValidationResult = ValidationError[] | null;

// ==================== Association Types ====================

/**
 * Association relationship types
 */
export enum AssociationType {
  HasOne = 'hasOne',
  HasMany = 'hasMany',
  BelongsTo = 'belongsTo',
  Extend = 'extend'
}

/**
 * Options for configuring associations
 */
export interface AssociationOptions {
  required?: boolean;
  autoFetch?: boolean;
  autoSave?: boolean;
  cascade?: boolean;
  eager?: boolean;
  lazy?: boolean;
  reverse?: string;
  target?: string;
}

/**
 * Association definition
 */
export interface AssociationDefinition {
  name: string;
  type: AssociationType;
  model: unknown; // Will be Model<T> at runtime
  options: AssociationOptions;
  field?: Record<string, unknown>;
}

// ==================== Query Types ====================

/**
 * Query conditions - flexible key-value pairs or special operators
 */
export interface QueryConditions {
  [key: string]: unknown;
  or?: QueryConditions[];
}

/**
 * Query options for find operations
 */
export interface QueryOptions {
  limit?: number;
  offset?: number;
  order?: Array<[string, 'ASC' | 'DESC']>;
  only?: string[];
  identityCache?: boolean | number;
  autoFetch?: boolean;
  autoFetchLimit?: number;
  raw?: boolean;
}

/**
 * Aggregate options
 */
export interface AggregateOptions {
  groupBy?: string[];
  conditions?: QueryConditions;
}

/**
 * Find options combining query and additional settings
 */
export interface FindOptions extends QueryOptions {
  autoFetch?: boolean;
  autoFetchLimit?: number;
  cascadeRemove?: boolean;
  merge?: Record<string, unknown>;
  exists?: Array<string | [string, Record<string, unknown>]>;
  extra?: Array<string | number | boolean | Date | null>;
  extra_info?: Record<string, unknown>;
  __eager?: boolean;
  __noCache?: boolean;
  __cacheKey?: string;
  identityCache?: boolean | number;
}

// ==================== Connection Types ====================

/**
 * Database connection configuration
 */
export interface ConnectionConfig {
  protocol: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  pathname?: string;
  pool?: PoolConfig;
  timezone?: string;
  /** Additional driver-specific options */
  [key: string]: unknown;
}

/**
 * Connection pool configuration
 */
export interface PoolConfig {
  min: number;
  max: number;
  idleTimeout: number;
  acquireTimeout: number;
}

/**
 * Callback for connection completion
 */
export type ConnectCallback<T = unknown> = (
  err: Error | null,
  db?: T
) => void;

/**
 * Connection options for ORM
 */
export interface ConnectionOptions {
  protocol?: string;
  host?: string;
  hostname?: string;
  port?: number | string;
  auth?: string;
  user?: string;
  username?: string;
  password?: string;
  database?: string;
  pathname?: string;
  query?: Record<string, any>;
  pool?: boolean;
  debug?: boolean;
  timezone?: string;
}

// ==================== ORM Interface ====================

/**
 * Main ORM interface
 */
export interface ORMInterface {
  validators: typeof import('../Validators')['default'];
  enforce: typeof import('../Validators')['default'];
  settings: SettingsInterface;
  driver_name: string;
  driver: any;
  tools: any;
  models: Record<string, Model<any>>;
  plugins: Plugin[];
  use(plugin: string | Plugin, options?: any): this;
  define<T = any>(name: string, properties?: Record<string, PropertyDefinition>, options?: ModelOptions<T>): Model<T>;
  ping(): Promise<void>;
  close(): Promise<void>;
  load(...files: Array<string | string[]>): Promise<void>;
  sync(): Promise<void>;
  drop(): Promise<void>;
  serial<T = Instance<any>>(...chains: ChainRunner<T>[]): SerialRunner<T>;
}

export interface ChainRunner<T = Instance<any>> {
  run(): Promise<T[]>;
}

export interface SerialRunner<T = Instance<any>> {
  get(): Promise<T[][]>;
  get(cb: (err: Error | null, ...results: T[][]) => void): Promise<void>;
}

// ==================== Settings Interface ====================

/**
 * Settings container
 */
/**
 * Settings container interface
 */
export interface SettingsInterface {
  set(key: string, value: any): this;
  get(key: string, def?: any): any;
  unset(...keys: string[]): this;
}

/**
 * Default settings object shape
 */
export interface SettingsContainer {
  properties: {
    primary_key: string;
    association_key: string;
    required: boolean;
  };
  instance: {
    identityCache: boolean;
    identityCacheSaveCheck: boolean;
    autoFetch: boolean;
    autoFetchLimit: number;
    cascadeRemove: boolean;
    returnAllErrors: boolean;
    saveAssociationsByDefault: boolean;
    promiseFunctionPostfix: string;
  };
  connection: {
    reconnect: boolean;
    pool: boolean;
    debug: boolean;
  };
  hasMany?: {
    key: boolean;
  };
}

// ==================== Driver Types ====================

/**
 * Driver options for query execution
 */
export interface DriverOptions {
  limit?: number;
  offset?: number;
  order?: Array<[string, string]>;
  only?: string[];
  merge?: Record<string, unknown>;
  exists?: Array<{
    table: string;
    select: string;
    where: Record<string, unknown>;
  }>;
}

/**
 * Raw driver result from database
 */
export interface DriverResult {
  [key: string]: unknown;
}

/**
 * Driver settings and configuration
 */
export interface DriverSettings {
  dataTypes: Record<string, unknown>;
  escapeId(name: string): string;
  escapeVal(value: unknown): string;
  [key: string]: unknown;
}

// ==================== Property Types ====================

/**
 * Available property types
 */
export type PropertyType =
  | 'text'
  | 'number'
  | 'integer'
  | 'float'
  | 'boolean'
  | 'date'
  | 'binary'
  | 'object'
  | 'enum'
  | 'point'
  | 'serial';

/**
 * Property definition configuration
 */
export interface PropertyDefinition {
  type?: string | PropertyType;
  key?: boolean;
  mapsTo?: string;
  defaultValue?: string | number | boolean | Date | null;
  required?: boolean;
  unique?: boolean | { scope?: string[] };
  index?: boolean | string;
  size?: number;
  time?: boolean;
  big?: boolean;
  rational?: boolean;
  values?: Array<string | number | boolean | Date | null>;
  lazyload?: boolean;
  lazyname?: string;
  enumerable?: boolean;
  serial?: boolean;
  unsigned?: boolean;
  primary?: boolean;
  timezone?: string;
  klass?: string;
  validators?: Validator[];
  get?: (this: any) => unknown;
  set?: (this: any, value: unknown) => void;
  /**
   * Property name - auto-populated
   */
  name?: string;
}

/**
 * Runtime property with metadata
 */
export interface Property {
  name: string;
  type: string;
  key: boolean;
  mapsTo: string;
  required: boolean;
  lazyname?: string;
  lazyload?: boolean;
  validators: Validator[];
  defaultValue?: string | number | boolean | Date | null;
  size?: number;
  unsigned?: boolean;
  time?: boolean;
  big?: boolean;
  rational?: boolean;
  values?: Array<string | number | boolean | Date | null>;
  unique?: boolean | { scope?: string[] };
  enumerable?: boolean;
  serial?: boolean;
  primary?: boolean;
  klass?: string;
}

// ==================== Generic Constraints ====================

/**
 * Valid ID types for models
 */
export type ID = string | number | (string | number)[];

/**
 * Base entity with required key properties
 */
export interface IdentifiableEntity {
  [key: string]: unknown;
}

/**
 * Generic model type parameter constraint
 */
export type ModelData<T = unknown> = T & IdentifiableEntity;

// ==================== Error Types ====================

/**
 * Standard error codes for ORM operations
 */
export enum ErrorCode {
  QueryError = 'QUERY_ERROR',
  ValidationError = 'VALIDATION_ERROR',
  NotFound = 'NOT_FOUND',
  ConnectionError = 'CONNECTION_ERROR',
  InvalidConfig = 'INVALID_CONFIG',
  NotSupported = 'NOT_SUPPORTED',
  DuplicateEntry = 'DUPLICATE_ENTRY',
  AccessDenied = 'ACCESS_DENIED',
  Timeout = 'TIMEOUT'
}

/**
 * ORM error with type and context
 */
export interface ORMErrorInfo {
  code: ErrorCode;
  message: string;
  context?: string;
  details?: Record<string, unknown>;
}

// ==================== Model Options ====================

/**
 * Options for defining a model
 */
export interface ModelOptions<_T = unknown> {
  /** Table name in database */
  table?: string;
  /** Model ID columns */
  id?: string | string[];
  /** Column name mapping */
  mapsTo?: string;
  /** Connection instance */
  connection?: unknown;
  /** Driver instance */
  driver?: any;
  /** Driver name */
  driver_name?: string;
  /** Database instance */
  db?: any;
  /** Auto fetch associations */
  autoFetch?: boolean;
  /** Auto fetch limit */
  autoFetchLimit?: number;
  /** Auto save associations */
  autoSave?: boolean;
  /** Cascade remove */
  cascadeRemove?: boolean;
  /** Cache fetch */
  cacheFetch?: boolean;
  /** Cache options */
  cache?: CacheOptions | boolean;
  /** Hooks */
  hooks?: HookMap;
  /** Custom methods */
  methods?: Record<string, Function>;
  /** Validations */
  validations?: Record<string, Array<(value: unknown, next: (err?: Error) => void) => void>>;
  /** Settings */
  settings?: SettingsInterface;
  /** Properties */
  properties?: Record<string, Property>;
  /** Extension */
  extension?: unknown;
  /** Order */
  order?: unknown[];
  /** Instance methods */
  instanceMethods?: Record<string, Function>;
  /** Keys */
  keys?: string | string[];
}

/**
 * Cache configuration for a model
 */
export interface CacheOptions {
  ttl?: number;
  maxSize?: number;
  strategy?: 'LRU' | 'LFU' | 'FIFO';
}

// ==================== Instance Data ====================

/**
 * Instance creation data
 */
export interface InstanceData {
  [key: string]: unknown;
}

/**
 * Instance options
 */
export interface InstanceOptions {
  data?: InstanceData;
  extra?: Record<string, unknown>;
  keys?: string | string[];
  is_new?: boolean;
  autoSave?: boolean;
  autoFetch?: boolean;
  autoFetchLimit?: number;
  cascadeRemove?: boolean;
  uid?: string;
  isShell?: boolean;
}

// ==================== Instance Interface ====================

/**
 * ORM Instance - represents a single database record
 */
export interface Instance<T = InstanceData> {
  isInstance: true;
  isPersisted(): boolean;
  isShell(): boolean;
  saved(): boolean;
  model(): Model<T>;
  [key: string]: unknown;
  save(): Promise<Instance<T>>;
  save(data: Partial<T>): Promise<Instance<T>>;
  save(data: Partial<T>, options: SaveOptions): Promise<Instance<T>>;
  remove(): Promise<Instance<T>>;
  validate(): Promise<Error[]>;
  on(event: string, listener: (...args: any[]) => void): this;
  off(event: string, listener: (...args: any[]) => void): this;
  emit(event: string, ...args: any[]): boolean;
  set(properties: Partial<T>): this;
  set(property: string, value: any): this;
}

// ==================== Model Interface ====================

/**
 * ORM Model - represents a database table
 */
export interface Model<T = any> {
  properties: Record<string, Property>;
  settings: SettingsInterface;
  table: string;
  id: string[];
  (...ids: unknown[]): Instance<T>;
  new (...ids: unknown[]): Instance<T>;
  sync(): Promise<void>;
  drop(): Promise<void>;
  find(): ChainFind<T>;
  find(conditions: Record<string, unknown>): ChainFind<T>;
  find(conditions: Record<string, unknown>, options: FindOptions): ChainFind<T>;
  all(): ChainFind<T>;
  all(conditions: Record<string, unknown>): ChainFind<T>;
  all(conditions: Record<string, unknown>, options: FindOptions): ChainFind<T>;
  one(conditions: Record<string, unknown>, options?: FindOptions): Promise<Instance<T> | null>;
  get(...ids: unknown[]): Promise<Instance<T> | null>;
  count(conditions?: Record<string, unknown>): Promise<number>;
  exists(...ids: any[]): Promise<boolean>;
  create(data: Partial<T> | Partial<T>[]): Promise<Instance<T> | Instance<T>[]>;
  clear(): Promise<void>;
  aggregate(properties?: string[]): Aggregate<T>;
  aggregate(conditions: Record<string, any>, properties?: string[]): Aggregate<T>;
  hasOne(name: string, model: Model, options?: AssociationOptions): Model<T>;
  hasMany(name: string, model: Model, options?: AssociationOptions): Model<T>;
  extendsTo(name: string, properties: Record<string, PropertyDefinition>, options?: ExtendOptions): Model<T>;
  beforeValidation(hook: ModelHooks['beforeValidation']): Model<T>;
  beforeCreate(hook: ModelHooks['beforeCreate']): Model<T>;
  afterCreate(hook: ModelHooks['afterCreate']): Model<T>;
  beforeSave(hook: ModelHooks['beforeSave']): Model<T>;
  afterSave(hook: ModelHooks['afterSave']): Model<T>;
  afterLoad(hook: ModelHooks['afterLoad']): Model<T>;
  afterAutoFetch(hook: ModelHooks['afterAutoFetch']): Model<T>;
  beforeRemove(hook: ModelHooks['beforeRemove']): Model<T>;
  afterRemove(hook: ModelHooks['afterRemove']): Model<T>;
}

// ==================== Chain Find & Aggregate ====================

/**
 * Fluent query interface for chaining find operations
 */
export interface ChainFind<T = any> extends PromiseLike<Instance<T>[]> {
  find(...args: any[]): ChainFind<T>;
  where(...args: any[]): ChainFind<T>;
  all(...args: any[]): ChainFind<T>;
  only(...fields: string[]): ChainFind<T>;
  omit(...fields: string[]): ChainFind<T>;
  limit(limit: number): ChainFind<T>;
  offset(offset: number): ChainFind<T>;
  skip(offset: number): ChainFind<T>;
  order(...order: Array<string | string[]>): ChainFind<T>;
  orderRaw(sql: string, args?: any[]): ChainFind<T>;
  eager(...associations: string[]): ChainFind<T>;
  count(): Promise<number>;
  remove(): Promise<void>;
  run(): Promise<Instance<T>[]>;
  first(): Promise<Instance<T> | null>;
  last(): Promise<Instance<T> | null>;
  each(): ChainInstanceCalls<Instance<T>>;
  each(
    cb: (instance: Instance<T>, index: number, items: Instance<T>[]) => void | Promise<void>
  ): ChainInstanceCalls<Instance<T>>;
  model: Model<T>;
  options: Record<string, unknown>;
  then<TResult1 = Instance<T>[], TResult2 = never>(
    onfulfilled?: (value: Instance<T>[]) => TResult1 | PromiseLike<TResult1>,
    onrejected?: (reason: any) => TResult2 | PromiseLike<TResult2>
  ): Promise<TResult1 | TResult2>;
  catch<TResult = never>(
    onrejected?: (reason: any) => TResult | PromiseLike<TResult>
  ): Promise<Instance<T>[] | TResult>;
}

/**
 * Aggregate query interface
 */
export interface Aggregate<T = any> {
  groupBy(...columns: string[]): Aggregate<T>;
  limit(limit: number): Aggregate<T>;
  limit(offset: number, limit: number): Aggregate<T>;
  order(...order: string[]): Aggregate<T>;
  select(columns: string[]): Aggregate<T>;
  select(...columns: string[]): Aggregate<T>;
  as(alias: string): Aggregate<T>;
  call(func: string, args: any[]): Aggregate<T>;
  get(cb: (err: Error | null, results: any[]) => void): void;
  getAsync(): Promise<any[]>;
}

// ==================== Extended Association Options ====================

/**
 * Options for extend associations
 */
export interface ExtendOptions extends AssociationOptions {
  table?: string;
  reverse?: string;
}

// ==================== Settings ====================

/**
 * Settings container interface
 */
export interface SettingsInterface {
  set(key: string, value: any): this;
  get(key: string, def?: any): any;
  unset(...keys: string[]): this;
}

// ==================== Save Options ====================

/**
 * Options for saving instances
 */
export interface SaveOptions {
  saveAssociations?: boolean;
}

// ==================== Model Hooks ====================

/**
 * All available hooks for model lifecycle
 */
export interface ModelHooks {
  beforeValidation?: (this: Instance, next: () => void) => void;
  beforeCreate?: (this: Instance, next: () => void) => void;
  afterCreate?: (this: Instance, success: boolean, next: () => void) => void;
  beforeSave?: (this: Instance, next: () => void) => void;
  afterSave?: (this: Instance, success: boolean, next: () => void) => void;
  afterLoad?: (this: Instance) => void;
  afterAutoFetch?: (this: Instance, next: () => void) => void;
  beforeRemove?: (this: Instance, next: () => void) => void;
  afterRemove?: (this: Instance, success: boolean, next: () => void) => void;
}

// ==================== Query Results ====================

/**
 * Result of a find query
 */
export type FindResult<T> = T[];

/**
 * Result of a count query
 */
export type CountResult = number;

/**
 * Result of an exists check
 */
export type ExistsResult = boolean;

/**
 * Result of an aggregate query
 */
export type AggregateResult = Record<string, unknown>;

// ==================== Discriminated Unions ====================

/**
 * Operation result that can be success or failure
 */
export type OperationResult<T> =
  | { success: true; data: T }
  | { success: false; error: Error };

/**
 * Query execution result with metadata
 */
export interface QueryExecutionResult<T> {
  data: T[];
  took: number;
  cached: boolean;
}

// ==================== Plugin Types ====================

/**
 * Plugin function signature
 */
export type Plugin = (orm: unknown, cb: (err?: Error) => void) => void;

/**
 * Plugin with metadata
 */
export interface PluginDefinition {
  name: string;
  version: string;
  plugin: Plugin;
}

// ==================== Event Types ====================

/**
 * Event listener callback
 */
export type EventListener = (...args: any[]) => void;

/**
 * Event emitter interface
 */
export interface EventEmitterLike {
  on(event: string, listener: EventListener): this;
  off(event: string, listener: EventListener): this;
  emit(event: string, ...args: any[]): boolean;
  once(event: string, listener: EventListener): this;
  removeAllListeners(event?: string): this;
}

// ==================== Driver & Adapter Types ====================

/**
 * Driver interface for database adapters
 */
export interface Driver {
  insert: (table: string, data: Record<string, unknown>, keys: PropertyDefinition[], callback: (err: Error | null, info?: unknown) => void) => void;
  update: (table: string, data: Record<string, unknown>, conditions: QueryConditions, callback: (err?: Error) => void) => void;
  remove: (table: string, conditions: QueryConditions, callback: (err?: Error, data?: unknown) => void) => void;
  propertyToValue?: (value: unknown, prop: PropertyDefinition) => unknown;
  valueToProperty?: (value: unknown, prop: PropertyDefinition) => unknown;
  [key: string]: unknown;
}

/**
 * Association definition for model relationships
 */
export interface AssociationDef {
  name: string | unknown;
  type?: string;
  required?: boolean;
  field?: Record<string, unknown>;
  changed?: boolean;
  [key: string]: unknown;
}



// ==================== Export all for convenience ====================

export default {
  ErrorCode,
  AssociationType,
  // TypeScript will infer all other types
};
