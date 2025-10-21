/**
 * Driver Interface Definitions for node-orm3
 * 
 * Defines the contract that all database drivers must implement.
 * This enables type-safe driver development and better IDE support.
 * 
 * All methods now return Promises for consistency with async/await patterns.
 */

import { DriverResult, DriverOptions } from './Core';

// ==================== Core Driver Interface ====================

/**
 * Main driver interface that all database drivers must implement
 * All methods are promise-based for async/await compatibility
 */
export interface IDriver {
  /**
   * Execute a SELECT query
   */
  find(
    columns: string[],
    table: string,
    conditions: Record<string, unknown>,
    options: DriverOptions
  ): Promise<DriverResult[]>;

  /**
   * Insert or update a record
   */
  save(
    table: string,
    data: Record<string, unknown>
  ): Promise<DriverResult>;

  /**
   * Delete records
   */
  remove(
    table: string,
    conditions: Record<string, unknown>
  ): Promise<void>;

  /**
   * Count matching records
   */
  count(
    table: string,
    conditions: Record<string, unknown>
  ): Promise<number>;

  /**
   * Check if record exists
   */
  exists(
    table: string,
    conditions: Record<string, unknown>
  ): Promise<boolean>;

  /**
   * Synchronize model with database
   */
  sync(): Promise<void>;

  /**
   * Drop table
   */
  drop(table: string): Promise<void>;

  /**
   * Define a model table
   */
  define(model: DriverDefineOptions): void;

  /**
   * Get driver settings
   */
  getSettings(): DriverSettings;

  /**
   * Execute raw query
   */
  execQuery(
    query: string,
    params?: unknown[]
  ): Promise<DriverResult[]>;

  /**
   * Get database connection
   */
  getConnection(): unknown;

  /**
   * Close database connection
   */
  close(): Promise<void>;

  /**
   * Execute aggregate function (SUM, AVG, MIN, MAX, etc.)
   */
  aggregate(
    table: string,
    func: string,
    column: string,
    conditions?: Record<string, unknown>
  ): Promise<unknown>;
}

// ==================== Model Definition ====================

/**
 * Options for defining a model in the driver
 */
export interface DriverDefineOptions {
  table: string;
  properties: Record<string, DriverPropertyDefinition>;
  indexes?: string[][];
  primaryKeys?: string[];
  charset?: string;
  collate?: string;
}

/**
 * Property definition for driver
 */
export interface DriverPropertyDefinition {
  type: string;
  required?: boolean;
  size?: number;
  key?: boolean;
  serial?: boolean;
  big?: boolean;
  unsigned?: boolean;
  default?: string | number | boolean | null;
  unique?: boolean | { scope?: string[] };
  index?: boolean | string;
  columnName?: string;
  [key: string]: unknown;
}

// ==================== Query Options ====================

/**
 * Extended driver options for complex queries
 */
export interface ExtendedDriverOptions extends DriverOptions {
  // Group operations
  group?: string[];
  having?: Record<string, unknown>;

  // Join operations
  joins?: DriverJoin[];

  // Raw SQL
  rawSql?: string;
  rawParams?: unknown[];

  // Eager loading
  eagerLoad?: DriverEagerLoadDefinition[];
}

/**
 * Join definition for queries
 */
export interface DriverJoin {
  type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
  table: string;
  alias?: string;
  on: Record<string, unknown>;
}

/**
 * Eager loading definition
 */
export interface DriverEagerLoadDefinition {
  name: string;
  table: string;
  field: string;
  keyField: string;
}

// ==================== Driver Settings ====================

/**
 * Driver configuration and capabilities
 */
export interface DriverSettings {
  /**
   * Supported property types and their SQL mappings
   */
  dataTypes: Record<string, unknown>;

  /**
   * Escape identifier (column/table name)
   */
  escapeId(name: string): string;

  /**
   * Escape value for SQL
   */
  escapeVal(value: unknown): string;

  /**
   * Create table SQL
   */
  createTableSQL?(options: DriverDefineOptions): string;

  /**
   * Drop table SQL
   */
  dropTableSQL?(table: string): string;

  /**
   * Database-specific features
   */
  capabilities?: DriverCapabilities;

  [key: string]: unknown;
}

/**
 * Database capabilities
 */
export interface DriverCapabilities {
  hasJoins: boolean;
  hasGroupBy: boolean;
  hasHaving: boolean;
  hasSubqueries: boolean;
  hasTransactions: boolean;
  hasFullTextSearch: boolean;
  supportsLimit: boolean;
  supportsOffset: boolean;
}

// ==================== Connection Pool ====================

/**
 * Connection pool interface for the driver
 */
export interface IConnectionPool {
  /**
   * Acquire a connection from the pool
   */
  acquire(cb: (err: Error | null, conn?: unknown) => void): void;

  /**
   * Release a connection back to the pool
   */
  release(conn: unknown): void;

  /**
   * Drain all connections
   */
  drain(cb: (err?: Error | null) => void): void;

  /**
   * Get pool statistics
   */
  stats(): PoolStats;
}

/**
 * Pool statistics
 */
export interface PoolStats {
  size: number;
  available: number;
  inUse: number;
  waiting: number;
}

// ==================== Query Builder ====================

/**
 * Query builder for the driver
 */
export interface IQueryBuilder {
  /**
   * Build a SELECT query
   */
  buildSelect(
    columns: string[],
    table: string,
    conditions: Record<string, unknown>,
    options: DriverOptions
  ): BuiltQuery;

  /**
   * Build an INSERT query
   */
  buildInsert(
    table: string,
    data: Record<string, unknown>
  ): BuiltQuery;

  /**
   * Build an UPDATE query
   */
  buildUpdate(
    table: string,
    data: Record<string, unknown>,
    conditions: Record<string, unknown>
  ): BuiltQuery;

  /**
   * Build a DELETE query
   */
  buildDelete(
    table: string,
    conditions: Record<string, unknown>
  ): BuiltQuery;

  /**
   * Build a COUNT query
   */
  buildCount(
    table: string,
    conditions: Record<string, unknown>
  ): BuiltQuery;
}

/**
 * Built SQL query with parameters
 */
export interface BuiltQuery {
  sql: string;
  params: unknown[];
  type: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'COUNT';
}

// ==================== Transactions ====================

/**
 * Transaction interface
 */
export interface ITransaction {
  /**
   * Begin transaction
   */
  begin(): Promise<void>;

  /**
   * Commit transaction
   */
  commit(): Promise<void>;

  /**
   * Rollback transaction
   */
  rollback(): Promise<void>;

  /**
   * Check if transaction is active
   */
  isActive(): boolean;

  /**
   * Execute query in transaction
   */
  query(
    sql: string,
    params: unknown[]
  ): Promise<DriverResult[]>;
}

// ==================== Bulk Operations ====================

/**
 * Bulk insert options
 */
export interface BulkInsertOptions {
  batchSize?: number;
  returnIds?: boolean;
  ignoreErrors?: boolean;
}

/**
 * Bulk update options
 */
export interface BulkUpdateOptions {
  batchSize?: number;
  condition?: Record<string, unknown>;
}

/**
 * Bulk delete options
 */
export interface BulkDeleteOptions {
  batchSize?: number;
  safeMode?: boolean;
}

// ==================== Migration ====================

/**
 * Migration for database schema
 */
export interface Migration {
  version: string;
  up(db: unknown): Promise<void>;
  down(db: unknown): Promise<void>;
}

/**
 * Migration runner interface
 */
export interface IMigrationRunner {
  /**
   * Run pending migrations
   */
  run(): Promise<void>;

  /**
   * Rollback migrations
   */
  rollback(steps: number): Promise<void>;

  /**
   * Get migration status
   */
  status(): Promise<MigrationStatus[]>;
}

/**
 * Migration status
 */
export interface MigrationStatus {
  version: string;
  executed: boolean;
  timestamp: Date;
}

// ==================== Export ====================

export default {
  // Interfaces exported for use in application code
};
