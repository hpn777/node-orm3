import { Table } from '../table';
import type { UnknownRecord } from '../util';
import { PgColumn } from './column';
import { PgIndex } from './index';

interface PostgresDriverLike {
  execSimpleQuery(sql: string): Promise<unknown>;
  query: { escapeVal(val: unknown, timezone?: string): string };
  config?: { schema?: string };
}

export class PostgresMetadataDriver {
  constructor(private readonly driver: PostgresDriverLike, private readonly schemaOverride?: string) {}

  async getVersion(): Promise<string | undefined> {
    const rows = await this.exec('SELECT version() AS version');
    return rows[0]?.version as string | undefined;
  }

  async getTables(): Promise<Table[]> {
    const schemaExpr = this.escapeSchema();
    const rows = await this.exec(`SELECT * FROM information_schema.tables WHERE table_schema = ${schemaExpr};`);
    return rows.map((row) => new Table(row));
  }

  async getColumns(tableName: string): Promise<PgColumn[]> {
    const schemaExpr = this.escapeSchema();
    const tableExpr = this.escape(tableName);
    const sql = `WITH column_privileges AS (
        SELECT table_schema,
               table_name,
               column_name,
               STRING_AGG(privilege_type, ', ' ORDER BY privilege_type) AS privileges
        FROM information_schema.column_privileges
        WHERE table_schema = ${schemaExpr}
        GROUP BY table_schema, table_name, column_name
      ),
      non_pk_constraints AS (
        SELECT DISTINCT ON (kcu.table_schema, kcu.table_name, kcu.column_name)
               kcu.table_schema,
               kcu.constraint_schema,
               kcu.table_name,
               kcu.column_name,
               tc.constraint_type,
               tc.constraint_name
        FROM information_schema.key_column_usage kcu
          JOIN information_schema.table_constraints tc
            ON kcu.constraint_catalog = tc.constraint_catalog
           AND kcu.constraint_schema = tc.constraint_schema
           AND kcu.constraint_name = tc.constraint_name
        WHERE kcu.table_schema = ${schemaExpr}
          AND tc.constraint_type != 'PRIMARY KEY'
        ORDER BY kcu.table_schema, kcu.table_name, kcu.column_name, tc.constraint_type DESC
      ),
      primary_key_columns AS (
        SELECT kcu.table_schema,
               kcu.table_name,
               kcu.column_name,
               tc.constraint_type
        FROM information_schema.key_column_usage kcu
          JOIN information_schema.table_constraints tc
            ON kcu.constraint_catalog = tc.constraint_catalog
           AND kcu.constraint_schema = tc.constraint_schema
           AND kcu.constraint_name = tc.constraint_name
        WHERE kcu.table_schema = ${schemaExpr}
          AND tc.constraint_type = 'PRIMARY KEY'
      ),
      fk_constraints AS (
        SELECT DISTINCT ON (kcu.table_schema, kcu.table_name, kcu.column_name)
               kcu.table_schema,
               kcu.table_name,
               kcu.column_name,
               kcu.constraint_name,
               ccu.table_name AS referenced_table_name,
               ccu.column_name AS referenced_column_name,
               rc.update_rule,
               rc.delete_rule
        FROM information_schema.key_column_usage kcu
          JOIN information_schema.table_constraints tc
            ON kcu.constraint_catalog = tc.constraint_catalog
           AND kcu.constraint_schema = tc.constraint_schema
           AND kcu.constraint_name = tc.constraint_name
          JOIN information_schema.referential_constraints rc
            ON tc.constraint_schema = rc.constraint_schema
           AND tc.constraint_name = rc.constraint_name
          LEFT JOIN information_schema.constraint_column_usage ccu
            ON rc.constraint_schema = ccu.constraint_schema
           AND rc.constraint_name = ccu.constraint_name
        WHERE kcu.table_schema = ${schemaExpr}
          AND tc.constraint_type = 'FOREIGN KEY'
      )
      SELECT c.*,
             CASE
               WHEN (pkc.constraint_type IS NULL
                     AND c.ordinal_position = 1
                     AND c.table_name LIKE 'v_crud_%')
                 THEN 'PRIMARY KEY'
               ELSE pkc.constraint_type
             END AS is_primary_key,
             npc.constraint_type AS column_key,
             cp.privileges,
             npc.constraint_name,
             fk.referenced_table_name,
             fk.referenced_column_name,
             fk.update_rule,
             fk.delete_rule
      FROM information_schema.columns c
        LEFT JOIN non_pk_constraints npc
          ON c.table_schema = npc.table_schema
         AND c.table_name = npc.table_name
         AND c.column_name = npc.column_name
        LEFT JOIN primary_key_columns pkc
          ON c.table_schema = pkc.table_schema
         AND c.table_name = pkc.table_name
         AND c.column_name = pkc.column_name
        LEFT JOIN fk_constraints fk
          ON c.table_schema = fk.table_schema
         AND c.table_name = fk.table_name
         AND c.column_name = fk.column_name
        LEFT JOIN column_privileges cp
          ON c.table_schema = cp.table_schema
         AND c.table_name = cp.table_name
         AND c.column_name = cp.column_name
      WHERE c.table_schema = ${schemaExpr}
        AND c.table_name = ${tableExpr};`;

    const rows = await this.exec(sql);
    return rows.map((row) => new PgColumn(row));
  }

  async getIndexes(tableName: string): Promise<PgIndex[]> {
    const schemaExpr = this.escapeSchema();
    const tableExpr = this.escape(tableName);
    const sql = `SELECT b.*, d.table_schema AS referenced_table_schema, d.table_name AS referenced_table_name, d.column_name AS referenced_column_name
      FROM information_schema.key_column_usage b
        LEFT JOIN information_schema.referential_constraints c
          ON b.table_schema = c.constraint_schema AND c.constraint_name = b.constraint_name
        LEFT JOIN information_schema.constraint_column_usage d
          ON b.table_schema = d.table_schema AND c.constraint_name = d.constraint_name
      WHERE b.table_schema = ${schemaExpr}
        AND b.table_name = ${tableExpr};`;

    const rows = await this.exec(sql);
    return rows.map((row) => new PgIndex(row));
  }

  async close(): Promise<void> {
    // Metadata shares ORM connection; nothing to close here.
    return Promise.resolve();
  }

  private escape(value: unknown): string {
    return this.driver.query.escapeVal(value);
  }

  private escapeSchema(): string {
    return this.escape(this.getSchema());
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

    const configSchema = this.driver.config?.schema;
    if (configSchema) {
      return configSchema;
    }

    return 'public';
  }
}
