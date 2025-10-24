import { Table } from '../table';
import type { UnknownRecord } from '../util';
import { SqliteColumn } from './column';
import { SqliteIndex } from './index';

interface SqliteDriverLike {
  execSimpleQuery(sql: string): Promise<unknown>;
  query: { escapeVal(val: unknown, timezone?: string): string };
}

export class SqliteMetadataDriver {
  constructor(private readonly driver: SqliteDriverLike) {}

  async getVersion(): Promise<string | undefined> {
    const rows = await this.exec('SELECT sqlite_version() AS version');
    return rows[0]?.version as string | undefined;
  }

  async getTables(): Promise<Table[]> {
    const rows = await this.exec(`SELECT name AS table_name, UPPER(type) AS table_type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%';`);
    return rows.map((row) => new Table(row));
  }

  async getColumns(tableName: string): Promise<SqliteColumn[]> {
    const tableExpr = this.escape(tableName);
    const rows = await this.exec(`PRAGMA table_info(${tableExpr});`);
    const columns = rows.map((row) => new SqliteColumn(row));

    const uniqueColumns = await this.getUniqueColumnNames(tableName);
    for (const column of columns) {
      if (uniqueColumns.has(column.getName())) {
        column.markUnique();
      }

      if (column.isPrimaryKey() && /int/i.test(column.getDataType())) {
        column.markAutoIncrement();
      }
    }

    return columns;
  }

  async getIndexes(tableName: string): Promise<SqliteIndex[]> {
    const tableExpr = this.escape(tableName);
    const indexList = await this.exec(`PRAGMA index_list(${tableExpr});`);
    const indexes: SqliteIndex[] = [];

    for (const index of indexList) {
      const indexName = index.name as string;
      if (!indexName) {
        continue;
      }
      const indexExpr = this.escape(indexName);
      const indexInfo = await this.exec(`PRAGMA index_info(${indexExpr});`);

      for (const info of indexInfo) {
        indexes.push(new SqliteIndex({
          index_name: indexName,
          table_name: tableName,
          name: info.name,
        }));
      }
    }

    return indexes;
  }

  async close(): Promise<void> {
    // Metadata shares ORM connection; nothing to close.
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

  private async getUniqueColumnNames(tableName: string): Promise<Set<string>> {
    const tableExpr = this.escape(tableName);
    const indexList = await this.exec(`PRAGMA index_list(${tableExpr});`);
    const uniqueColumns = new Set<string>();

    for (const index of indexList) {
      const uniqueValue = index.unique;
      const isUnique = uniqueValue === 1 || uniqueValue === '1' || uniqueValue === true;
      if (!isUnique) {
        continue;
      }

      const indexName = index.name as string;
      const indexExpr = this.escape(indexName);
      const indexInfo = await this.exec(`PRAGMA index_info(${indexExpr});`);
      for (const info of indexInfo) {
        if (info.name) {
          uniqueColumns.add(String(info.name));
        }
      }
    }

    return uniqueColumns;
  }
}
