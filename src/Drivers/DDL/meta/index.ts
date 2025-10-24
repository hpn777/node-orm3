import type { Table } from './table';

export { Table } from './table';
export { Column } from './column';
export { DatabaseIndex } from './databaseIndex';
export type { UnknownRecord } from './util';

export { MysqlMetadataDriver } from './mysql/metadata';
export { PostgresMetadataDriver } from './postgresql/metadata';
export { SqliteMetadataDriver } from './sqlite/metadata';

export interface MetadataInspector<TColumn = unknown, TIndex = unknown> {
  getVersion(): Promise<string | undefined>;
  getTables(): Promise<Table[]>;
  getColumns(tableName: string): Promise<TColumn[]>;
  getIndexes(tableName: string): Promise<TIndex[]>;
  close(): Promise<void>;
}

export interface MetadataOptions {
  schema?: string;
}
