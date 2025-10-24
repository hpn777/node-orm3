import { Table } from '../table';
import type { UnknownRecord } from '../util';
import { MysqlColumn } from './column';
import { MysqlIndex } from './index';

interface MysqlDriverLike {
  execSimpleQuery(sql: string): Promise<unknown>;
  query: { escapeVal(val: unknown, timezone?: string): string };
  config?: { database?: string };
  db?: { config?: { database?: string }; database?: string };
}

export class MysqlMetadataDriver {
  constructor(private readonly driver: MysqlDriverLike, private readonly schemaOverride?: string) {}

  async getVersion(): Promise<string | undefined> {
    const rows = await this.exec("SELECT VERSION() AS version");
    return rows[0]?.version as string | undefined;
  }

  async getTables(): Promise<Table[]> {
    const schema = this.getSchema();
    const escapedSchema = this.escape(schema);
    const rows = await this.exec(`SELECT * FROM information_schema.tables WHERE table_schema = ${escapedSchema}`);
    return rows.map((row) => new Table(row));
  }

  async getColumns(tableName: string): Promise<MysqlColumn[]> {
    const schema = this.getSchema();
    const escapedSchema = this.escape(schema);
    const escapedTable = this.escape(tableName);
    const sql = `SELECT a.*, b.CONSTRAINT_NAME, b.REFERENCED_TABLE_NAME, b.REFERENCED_COLUMN_NAME, c.UPDATE_RULE, c.DELETE_RULE
      FROM INFORMATION_SCHEMA.COLUMNS a
      LEFT OUTER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE b
        ON a.table_schema = b.table_schema AND a.table_name = b.table_name AND a.column_name = b.column_name
      LEFT OUTER JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS c
        ON c.CONSTRAINT_NAME = b.CONSTRAINT_NAME
      WHERE a.table_schema = ${escapedSchema} AND a.table_name = ${escapedTable}`;

    const rows = await this.exec(sql);
    return rows.map((row) => new MysqlColumn(row));
  }

  async getIndexes(tableName: string): Promise<MysqlIndex[]> {
    const schema = this.getSchema();
    const escapedSchema = this.escape(schema);
    const escapedTable = this.escape(tableName);
    const sql = `SELECT * FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = ${escapedSchema} AND TABLE_NAME = ${escapedTable}`;

    const rows = await this.exec(sql);
    return rows.map((row) => new MysqlIndex(row));
  }

  async close(): Promise<void> {
    // Reuse existing ORM connection; no-op for metadata.
    return Promise.resolve();
  }

  private escape(value: unknown): string {
    return this.driver.query.escapeVal(value);
  }

  private async exec(sql: string): Promise<UnknownRecord[]> {
    const result = await this.driver.execSimpleQuery(sql);
    if (Array.isArray(result)) {
      return result as UnknownRecord[];
    }
    return [];
  }

  private getSchema(): string {
    if (this.schemaOverride) {
      return this.schemaOverride;
    }

    const configDatabase = this.driver.config?.database;
    if (configDatabase) {
      return configDatabase;
    }

    const dbInstance = this.driver.db as { database?: string; config?: { database?: string } } | undefined;
    if (dbInstance?.database) {
      return dbInstance.database;
    }

    if (dbInstance?.config?.database) {
      return dbInstance.config.database;
    }

    throw new Error('Unable to determine MySQL database/schema name for metadata inspection');
  }
}
