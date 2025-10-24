import { build as buildWhere } from './Where';
import type { Dialect, QueryOptions } from './types';

export interface RemoveQueryBuilder {
  from: (table: string) => RemoveQueryBuilder;
  where: (...conditions: Record<string, any>[]) => RemoveQueryBuilder;
  offset: (offset: number) => RemoveQueryBuilder;
  limit: (limit: number) => RemoveQueryBuilder;
  order: (column: string | [any, any], direction: string) => RemoveQueryBuilder;
  build: () => string;
}

export function RemoveQuery(dialect: Dialect, opts: QueryOptions = {}): RemoveQueryBuilder {
  const sql: {
    table?: string;
    where: { t: null; w: Record<string, any> }[];
    order: { c: string | [any, any]; d: string }[];
    offset?: number;
    limit?: number;
  } = {
    where: [],
    order: []
  };

  return {
    from(table: string): RemoveQueryBuilder {
      sql.table = table;
      return this;
    },

    where(...conditions: Record<string, any>[]): RemoveQueryBuilder {
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

      if (dialect.limitAsTop && Object.prototype.hasOwnProperty.call(sql, 'limit')) {
        query.push(`DELETE TOP ${sql.limit} FROM`);
      } else {
        query.push('DELETE FROM');
      }

      query.push(dialect.escapeId(sql.table));

      const whereClause = buildWhere(dialect, sql.where, opts);
      if (Array.isArray(whereClause)) {
        query.push(...whereClause);
      } else if (whereClause) {
        query.push(whereClause);
      }

      if (sql.order.length > 0) {
        const orderParts: string[] = [];
        for (let i = 0; i < sql.order.length; i += 1) {
          const orderSpec = sql.order[i];
          if (Array.isArray(orderSpec.c)) {
            orderParts.push(`${dialect.escapeId(orderSpec.c[0], orderSpec.c[1])} ${orderSpec.d}`);
          } else {
            orderParts.push(`${dialect.escapeId(orderSpec.c)} ${orderSpec.d}`);
          }
        }

        if (orderParts.length > 0) {
          query.push(`ORDER BY ${orderParts.join(', ')}`);
        }
      }

      if (!dialect.limitAsTop) {
        if (Object.prototype.hasOwnProperty.call(sql, 'limit')) {
          if (Object.prototype.hasOwnProperty.call(sql, 'offset')) {
            query.push(`LIMIT ${sql.limit} OFFSET ${sql.offset}`);
          } else {
            query.push(`LIMIT ${sql.limit}`);
          }
        } else if (Object.prototype.hasOwnProperty.call(sql, 'offset')) {
          query.push(`OFFSET ${sql.offset}`);
        }
      }

      return query.join(' ');
    },

    offset(offset: number): RemoveQueryBuilder {
      sql.offset = offset;
      return this;
    },

    limit(limit: number): RemoveQueryBuilder {
      sql.limit = limit;
      return this;
    },

    order(column: string | [any, any], dir: string): RemoveQueryBuilder {
      sql.order.push({
        c: Array.isArray(column) ? [column[0], column[1]] : column,
        d: dir === 'Z' ? 'DESC' : 'ASC'
      });
      return this;
    }
  };
}
