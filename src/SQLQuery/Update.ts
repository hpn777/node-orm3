import { build as buildSet } from './Set';
import { build as buildWhere } from './Where';
import type { Dialect, QueryOptions } from './types';

export interface UpdateQueryBuilder {
  into: (table: string) => UpdateQueryBuilder;
  set: (values: Record<string, any>) => UpdateQueryBuilder;
  where: (...conditions: Record<string, any>[]) => UpdateQueryBuilder;
  build: () => string;
}

export function UpdateQuery(dialect: Dialect, opts: QueryOptions = {}): UpdateQueryBuilder {
  const sql: { table?: string; set?: Record<string, any>; where: { t: null; w: Record<string, any> }[] } = {
    where: []
  };

  return {
    into(table: string): UpdateQueryBuilder {
      sql.table = table;
      return this;
    },

    set(values: Record<string, any>): UpdateQueryBuilder {
      sql.set = values;
      return this;
    },

    where(...conditions: Record<string, any>[]): UpdateQueryBuilder {
      for (let i = 0; i < conditions.length; i += 1) {
        sql.where.push({
          t: null,
          w: conditions[i]
        });
      }
      return this;
    },

    build(): string {
      const query: string[] = [];

      query.push('UPDATE');
      query.push(dialect.escapeId(sql.table));

      const setClause = buildSet(dialect, sql.set || {}, opts);
      if (Array.isArray(setClause)) {
        query.push(...setClause);
      } else if (setClause) {
        query.push(setClause);
      }

      const whereClause = buildWhere(dialect, sql.where, opts);
      if (Array.isArray(whereClause)) {
        query.push(...whereClause);
      } else if (whereClause) {
        query.push(whereClause);
      }

      return query.join(' ');
    }
  };
}
