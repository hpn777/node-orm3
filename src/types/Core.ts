/**
 * Core Type Definitions for node-orm3
 * 
 * Central type definitions for callbacks, hooks, validation, associations,
 * queries, connections, and properties. This file replaces scattered `any`
 * types throughout the codebase.
 */

// ==================== Callback Types ====================

/**
 * Standard error-first callback pattern
 */
export type ErrorCallback = (err: Error | null) => void;

/**
 * Generic callback result type - adapts to async/callback patterns
 */
export type ResultCallback<_T> = (err: null | Error, data: unknown) => void;

/**
 * Callback for void operations
 */
export type VoidCallback = (err: Error | null) => void;

// ==================== Hook Types ====================

/**
 * Hook function that can be synchronous, callback-based, or promise-based
 */
export type HookFunction = (next?: ErrorCallback) => void | Promise<void>;

/**
 * Hook function with options parameter
 */
export type HookFunctionWithOptions<T = unknown> = (
  options: T,
  next?: ErrorCallback
) => void | Promise<void>;

/**
 * Registry of all available hooks for a model
 */
export type HookMap = Record<string, HookFunction | undefined>;

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
 * Validator function signature
 */
export type Validator<T = unknown> = (
  value: T,
  next: (err?: Error) => void
) => void;

/**
 * Validation result - either success (null) or array of errors
 */
export type ValidationResult = ValidationError[] | null;

/**
 * Custom validation rule definition
 */
export interface ValidationRule {
  name: string;
  validator: Validator;
  message?: string;
}

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
  validators: any;
  enforce: any;
  settings: SettingsInterface;
  driver_name: string;
  driver: any;
  tools: any;
  models: Record<string, Model>;
  plugins: Plugin[];
  use(plugin: string | Plugin, options?: any): any;
  define<T = any>(name: string, properties: Record<string, PropertyDefinition>, options?: ModelOptions<T>): Model<T>;
  ping(cb: (err: Error | null) => void): any;
  pingAsync(): Promise<void>;
  close(cb: (err: Error | null) => void): any;
  closeAsync(): Promise<void>;
  load(file: string | string[], cb: (err: Error | null) => void): void;
  loadAsync(file: string | string[]): Promise<void>;
  sync(cb: (err: Error | null) => void): any;
  syncAsync(): Promise<void>;
  drop(cb: (err: Error | null) => void): any;
  dropAsync(): Promise<void>;
  serial(...chains: any[]): { get: (cb: (err: Error | null, results: any[]) => void) => void; getAsync: () => Promise<any[]>; };
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
  save(cb: (err: Error | null) => void): void;
  save(data: Partial<T>, cb: (err: Error | null) => void): void;
  save(data: Partial<T>, options: SaveOptions, cb: (err: Error | null) => void): void;
  saveAsync(): Promise<void>;
  saveAsync(data: Partial<T>): Promise<void>;
  saveAsync(data: Partial<T>, options: SaveOptions): Promise<void>;
  remove(cb: (err: Error | null) => void): void;
  removeAsync(): Promise<void>;
  validate(cb: (errors: Error[]) => void): void;
  validateAsync(): Promise<Error[]>;
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
  sync(cb: (err: Error | null) => void): void;
  syncAsync(): Promise<void>;
  drop(cb: (err: Error | null) => void): void;
  dropAsync(): Promise<void>;
  find(conditions?: Record<string, unknown>): ChainFind<T>;
  find(conditions: Record<string, unknown>, cb: (err: Error | null, instances: Instance<T>[]) => void): void;
  find(conditions: Record<string, unknown>, options: FindOptions, cb: (err: Error | null, instances: Instance<T>[]) => void): void;
  findAsync(conditions?: Record<string, unknown>, options?: FindOptions): Promise<Instance<T>[]>;
  all(conditions: Record<string, unknown>, cb: (err: Error | null, instances: Instance<T>[]) => void): void;
  all(conditions: Record<string, unknown>, options: FindOptions, cb: (err: Error | null, instances: Instance<T>[]) => void): void;
  allAsync(conditions: Record<string, unknown>, options?: FindOptions): Promise<Instance<T>[]>;
  one(conditions: Record<string, unknown>, cb: (err: Error | null, instance: Instance<T> | null) => void): void;
  one(conditions: Record<string, unknown>, options: FindOptions, cb: (err: Error | null, instance: Instance<T> | null) => void): void;
  oneAsync(conditions: Record<string, unknown>, options?: FindOptions): Promise<Instance<T> | null>;
  get(...ids: unknown[]): Model<T>;
  get(...ids: unknown[]): void;
  getAsync(...ids: unknown[]): Promise<Instance<T> | null>;
  count(cb: (err: Error | null, count: number) => void): void;
  count(conditions: Record<string, unknown>, cb: (err: Error | null, count: number) => void): void;
  countAsync(conditions?: Record<string, unknown>): Promise<number>;
  exists(...ids: any[]): void;
  existsAsync(...ids: any[]): Promise<boolean>;
  create(data: Partial<T>, cb: (err: Error | null, instance: Instance<T>) => void): void;
  create(data: Partial<T>[]): void;
  createAsync(data: Partial<T> | Partial<T>[]): Promise<Instance<T> | Instance<T>[]>;
  clear(cb: (err: Error | null) => void): void;
  clearAsync(): Promise<void>;
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
export interface ChainFind<T = any> {
  find(conditions: Record<string, any>): ChainFind<T>;
  where(conditions: Record<string, any>): ChainFind<T>;
  only(...fields: string[]): ChainFind<T>;
  omit(...fields: string[]): ChainFind<T>;
  limit(limit: number): ChainFind<T>;
  offset(offset: number): ChainFind<T>;
  skip(offset: number): ChainFind<T>;
  order(...order: string[]): ChainFind<T>;
  orderRaw(sql: string, args?: any[]): ChainFind<T>;
  count(cb: (err: Error | null, count: number) => void): void;
  countAsync(): Promise<number>;
  remove(cb: (err: Error | null) => void): void;
  removeAsync(): Promise<void>;
  save(cb: (err: Error | null) => void): void;
  saveAsync(): Promise<void>;
  run(cb: (err: Error | null, instances: Instance<T>[]) => void): void;
  runAsync(): Promise<Instance<T>[]>;
  all(cb: (err: Error | null, instances: Instance<T>[]) => void): void;
  allAsync(): Promise<Instance<T>[]>;
  eager(...associations: string[]): ChainFind<T>;
  each(cb: (instance: Instance<T>) => void): ChainFind<T>;
  each(): ChainFind<T>;
  filter(cb: (instance: Instance<T>) => boolean): ChainFind<T>;
  sort(cb: (a: Instance<T>, b: Instance<T>) => number): ChainFind<T>;
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

// ==================== Hook Callback ====================

/**
 * Generic hook callback
 */
export type HookCallback = (this: any, next?: () => void) => void;

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
