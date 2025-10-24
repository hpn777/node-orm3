import type { Dialect, QueryOptions } from './types';

export interface InsertQueryBuilder {
  into: (table: string) => InsertQueryBuilder;
  set: (values: Record<string, any>) => InsertQueryBuilder;
  build: () => string;
}

export function InsertQuery(dialect: Dialect, opts: QueryOptions = {}): InsertQueryBuilder {
  const sql: Record<string, any> = {};

  return {
    into(table: string): InsertQueryBuilder {
      sql.table = table;
      return this;
    },

    set(values: Record<string, any>): InsertQueryBuilder {
      sql.set = values;
      return this;
    },

    build(): string {
      const query: string[] = [];
      const cols: string[] = [];
      const vals: string[] = [];

      query.push('INSERT INTO');
      query.push(dialect.escapeId(sql.table));

      if (Object.prototype.hasOwnProperty.call(sql, 'set')) {
        for (const key in sql.set) {
          if (!Object.prototype.hasOwnProperty.call(sql.set, key)) {
            continue;
          }
          cols.push(dialect.escapeId(key));
          vals.push(dialect.escapeVal(sql.set[key], opts?.timezone));
        }

        if (cols.length === 0) {
          query.push(String(dialect.defaultValuesStmt || 'VALUES()'));
        } else {
          query.push(`(${cols.join(', ')})`);
          query.push(`VALUES (${vals.join(', ')})`);
        }
      }

      return query.join(' ');
    }
  };
}
