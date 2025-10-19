/**
 * Core Type Definitions for node-orm3
 */

import { EventEmitter } from 'events';
import enforce from './shims/enforce';

// ==================== Property Types ====================

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
  values?: Array<string | number | boolean | Date | null>;
  lazyload?: boolean;
  lazyname?: string;
  enumerable?: boolean;
  rational?: boolean;
  serial?: boolean;
  unsigned?: boolean;
  primary?: boolean;
  timezone?: string;
  klass?: string;
  name?: string;
  validators?: Array<(value: unknown, next: (err?: Error) => void) => void>;
}

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

export interface Property {
  name: string;
  type: string;
  mapsTo: string;
  key: boolean;
  required: boolean;
  unique: boolean | { scope?: string[] };
  defaultValue?: string | number | boolean | Date | null;
  size?: number;
  rational?: boolean;
  time?: boolean;
  big?: boolean;
  values?: Array<string | number | boolean | Date | null>;
  lazyload?: boolean;
  lazyname?: string;
  enumerable: boolean;
  serial?: boolean;
  unsigned?: boolean;
  primary?: boolean;
  klass?: string;
  validators?: Array<(value: unknown, next: (err?: Error) => void) => void>;
}

// ==================== Model Types ====================

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

export interface ModelOptions<T = any> {
  keys?: string | string[];
  autoFetch?: boolean;
  autoFetchLimit?: number;
  cascadeRemove?: boolean;
  cacheFetch?: boolean;
  cache?: boolean;
  hooks?: ModelHooks;
  methods?: Record<string, (...args: unknown[]) => unknown>;
  validations?: Record<string, Array<(value: unknown, next: (err?: Error) => void) => void>>;
  table?: string;
  connection?: unknown;
  driver?: any;
  driver_name?: string;
  settings?: SettingsInterface;
  id?: string | string[];
  properties?: Record<string, Property>;
  autoSave?: boolean;
  db?: any;
  extension?: unknown;
  order?: unknown[];
  instanceMethods?: Record<string, (...args: unknown[]) => unknown>;
}

export interface FindOptions {
  limit?: number;
  offset?: number;
  only?: string[];
  order?: string[] | string;
  merge?: Record<string, unknown>;
  exists?: Array<string | [string, Record<string, unknown>]>;
  __eager?: boolean;
  __noCache?: boolean;
  __cacheKey?: string;
  identityCache?: boolean | number;
  autoFetch?: boolean;
  autoFetchLimit?: number;
  cascadeRemove?: boolean;
  extra?: Array<string | number | boolean | Date | null>;
  extra_info?: Record<string, unknown>;
}

export interface QueryConditions {
  [key: string]: unknown;
}

export interface AssociationDefinition {
  name: string;
  model?: unknown;
  field?: string | string[];
  mapsTo?: string;
  [key: string]: unknown;
}

export type HookCallback = (this: any, next?: () => void) => void;
// For HookCallback, consider replacing 'any' with 'unknown' if possible, but may require broader refactor.

export interface AggregateOptions {
  propertyName?: string;
  limit?: number;
  offset?: number;
  order?: string[];
  groupBy?: string[];
}

export interface SaveOptions {
  saveAssociations?: boolean;
}

// ==================== Instance Types ====================

export interface InstanceData {
  [key: string]: unknown;
}

export interface Instance<T = InstanceData> {
  // Properties
  isInstance: true;
  isPersisted(): boolean;
  isShell(): boolean;
  saved(): boolean;
  model(): Model<T>;
  
  // Data access
  [key: string]: unknown;
  
  // Methods
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
  
  // Setters
  set(properties: Partial<T>): this;
  set(property: string, value: any): this;
}

// ==================== Model Interface ====================

export interface Model<T = any> {
  // Static properties
  properties: Record<string, Property>;
  settings: SettingsInterface;
  table: string;
  id: string[];
  
  // Constructor
  (...ids: unknown[]): Instance<T>;
  new (...ids: unknown[]): Instance<T>;
  
  // Database operations
  sync(cb: (err: Error | null) => void): void;
  syncAsync(): Promise<void>;
  
  drop(cb: (err: Error | null) => void): void;
  dropAsync(): Promise<void>;
  
  // Query methods
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
  
  // Create/Update/Delete
  create(data: Partial<T>, cb: (err: Error | null, instance: Instance<T>) => void): void;
  create(data: Partial<T>[]): void;
  createAsync(data: Partial<T> | Partial<T>[]): Promise<Instance<T> | Instance<T>[]>;
  
  clear(cb: (err: Error | null) => void): void;
  clearAsync(): Promise<void>;
  
  // Aggregation
  aggregate(properties?: string[]): Aggregate<T>;
  aggregate(conditions: Record<string, any>, properties?: string[]): Aggregate<T>;
  
  // Associations
  hasOne(name: string, model: Model, options?: AssociationOptions): Model<T>;
  hasMany(name: string, model: Model, options?: AssociationOptions): Model<T>;
  extendsTo(name: string, properties: Record<string, PropertyDefinition>, options?: ExtendOptions): Model<T>;
  
  // Hooks
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

// ==================== Chain Find ====================

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

// ==================== Aggregate ====================

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

// ==================== Association Options ====================

export interface AssociationOptions {
  name?: string;
  required?: boolean;
  reverse?: string | boolean;
  autoFetch?: boolean;
  autoFetchLimit?: number;
  getAccessor?: string;
  setAccessor?: string;
  hasAccessor?: string;
  delAccessor?: string;
  addAccessor?: string;
  field?: string;
  mergeTable?: string;
  mergeId?: string;
  mergeAssocId?: string;
  hooks?: ModelHooks;
}

export interface ExtendOptions extends AssociationOptions {
  table?: string;
  reverse?: string;
}

// ==================== ORM Settings ====================

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

export interface SettingsInterface {
  set(key: string, value: any): this;
  get(key: string, def?: any): any;
  unset(...keys: string[]): this;
}

// ==================== Connection Options ====================

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

// ==================== ORM Class ====================

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
  
  serial(...chains: any[]): {
    get: (cb: (err: Error | null, results: any[]) => void) => void;
    getAsync: () => Promise<any[]>;
  };
}

// ==================== Plugin Interface ====================

export type Plugin = (orm: any, options: any, next: () => void) => void;

// ==================== Connect Function ====================

export type ConnectCallback = (err: Error | null, orm?: any) => void;

// ==================== Singleton ====================

export interface SingletonOptions {
  identityCache?: boolean | number;
  saveCheck?: boolean;
}

// ==================== Error Codes ====================

export interface ErrorCodesInterface {
  QUERY_ERROR: number;
  NOT_FOUND: number;
  NOT_DEFINED: number;
  NO_SUPPORT: number;
  MISSING_CALLBACK: number;
  PARAM_MISMATCH: number;
  CONNECTION_LOST: number;
  BAD_MODEL: number;
}

// ==================== Validators ====================

export type ValidatorFunction = (v: any, next: (err?: string) => void, ctx?: any) => void;
