import { escapeQuery } from './Helpers';
import type { Dialect, QueryOptions } from './types';

export interface WhereExistsClause {
  t: string;
  tl: string;
  l: any[];
}

export interface WhereCondition {
  t: string | null;
  w: Record<string, any>;
  e?: {
    t: string;
    tl: string;
    l: any[];
  };
}

export function build(dialect: Dialect, where: WhereCondition[], opts?: QueryOptions): string | string[] {
  if (!where.length) {
    return [];
  }

  const clauses: (string | string[])[] = [];

  for (let i = 0; i < where.length; i += 1) {
    const subquery = buildOrGroup(dialect, where[i], opts || {});

    if (subquery !== false) {
      clauses.push(subquery);
    }
  }

  if (clauses.length === 0) {
    return [];
  }

  if (clauses.length === 1) {
    return `WHERE ${clauses[0]}`;
  }

  return `WHERE (${clauses.join(') AND (')})`;
}

type BuildResult = string | string[] | false;

type ComparatorKey = 'or' | 'and' | 'not_or' | 'not_and' | 'not';

function buildOrGroup(dialect: Dialect, where: WhereCondition, opts: QueryOptions): BuildResult {
  const options = opts || {};

  if (where.e) {
    const wheres: string[] = [];
    const link = where.e.l;

    if (Array.isArray(link[0]) && Array.isArray(link[1])) {
      for (let i = 0; i < link[0].length; i += 1) {
        wheres.push(`${dialect.escapeId(link[0][i])} = ${dialect.escapeId(where.e.tl, link[1][i])}`);
      }
    } else {
      wheres.push(`${dialect.escapeId(link[0])} = ${dialect.escapeId(where.e.tl, link[1])}`);
    }

    const nested = buildOrGroup(dialect, { t: null, w: where.w }, options);
    if (nested === false) {
      return false;
    }

    return [
      `EXISTS (SELECT * FROM ${dialect.escapeId(where.e.t)} ` +
        `WHERE ${wheres.join(' AND ')} AND ${nested})`
    ];
  }

  const query: string[] = [];

  for (const key in where.w) {
    if (!Object.prototype.hasOwnProperty.call(where.w, key)) {
      continue;
    }

    const value = where.w[key];

    if (value === null || value === undefined) {
      query.push(`${buildComparisonKey(dialect, where.t, key)} IS NULL`);
      continue;
    }

    if (isLogicalKey(key)) {
      const opKey = key as ComparatorKey;
      const subqueries: (string | string[])[] = [];
      const prefix = opKey === 'not' || opKey.indexOf('_') >= 0 ? 'NOT ' : '';
      const operator = (opKey === 'not' ? 'and' : opKey.indexOf('_') >= 0 ? opKey.slice(4) : opKey).toUpperCase();

      for (let j = 0; j < value.length; j += 1) {
        const built = buildOrGroup(dialect, { t: where.t, w: value[j] }, options);
        if (built !== false) {
          subqueries.push(built);
        }
      }

      if (subqueries.length > 0) {
        query.push(`${prefix}((${subqueries.join(`) ${operator} (`)}))`);
      }
      continue;
    }

    if (typeof value.sql_comparator === 'function') {
      const comparator = value.sql_comparator();

      switch (comparator) {
        case 'between':
          query.push(
            `${buildComparisonKey(dialect, where.t, key)} BETWEEN ${dialect.escapeVal(value.from, options.timezone)} AND ${dialect.escapeVal(value.to, options.timezone)}`
          );
          break;
        case 'not_between':
          query.push(
            `${buildComparisonKey(dialect, where.t, key)} NOT BETWEEN ${dialect.escapeVal(value.from, options.timezone)} AND ${dialect.escapeVal(value.to, options.timezone)}`
          );
          break;
        case 'like':
          query.push(
            `${buildComparisonKey(dialect, where.t, key)} LIKE ${dialect.escapeVal(value.expr, options.timezone)}`
          );
          break;
        case 'not_like':
          query.push(
            `${buildComparisonKey(dialect, where.t, key)} NOT LIKE ${dialect.escapeVal(value.expr, options.timezone)}`
          );
          break;
        case 'eq':
        case 'ne':
        case 'gt':
        case 'gte':
        case 'lt':
        case 'lte':
        case 'not_in': {
          let op: string;
          switch (comparator) {
            case 'eq':
              op = value.val === null ? 'IS' : '=';
              break;
            case 'ne':
              op = value.val === null ? 'IS NOT' : '<>';
              break;
            case 'gt':
              op = '>';
              break;
            case 'gte':
              op = '>=';
              break;
            case 'lt':
              op = '<';
              break;
            case 'lte':
              op = '<=';
              break;
            case 'not_in':
              op = 'NOT IN';
              break;
            default:
              op = '=';
          }

          query.push(
            `${buildComparisonKey(dialect, where.t, key)} ${op} ${dialect.escapeVal(value.val, options.timezone)}`
          );
          break;
        }
        case 'sql':
          if (typeof value.where === 'object' && value.where) {
            let sql = value.where.str.replace('?:column', buildComparisonKey(dialect, where.t, key));

            sql = sql.replace(/\?:(id|value)/g, (m: string): string => {
              if (value.where.escapes.length === 0) {
                return '';
              }

              if (m === '?:id') {
                return dialect.escapeId(value.where.escapes.shift());
              }

              return dialect.escapeVal(value.where.escapes.shift(), options.timezone);
            });

            query.push(sql);
          }
          break;
        default:
          break;
      }

      continue;
    }

    if (key === '__sql') {
      for (let idx = 0; idx < value.length; idx += 1) {
        query.push(normalizeSqlConditions(dialect, value[idx]));
      }
      continue;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        query.push('FALSE');
      } else {
        query.push(`${buildComparisonKey(dialect, where.t, key)} IN ${dialect.escapeVal(value, options.timezone)}`);
      }
    } else {
      query.push(`${buildComparisonKey(dialect, where.t, key)} = ${dialect.escapeVal(value, options.timezone)}`);
    }
  }

  if (query.length === 0) {
    return false;
  }

  return query.join(' AND ');
}

function buildComparisonKey(dialect: Dialect, table: string | null, column: string): string {
  return table ? dialect.escapeId(table, column) : dialect.escapeId(column);
}

function normalizeSqlConditions(dialect: Dialect, queryArray: any[]): string {
  if (queryArray.length === 1) {
    return queryArray[0];
  }

  return escapeQuery(dialect, queryArray[0], queryArray[1]);
}

function isLogicalKey(key: string): key is ComparatorKey {
  return key === 'or' || key === 'and' || key === 'not_or' || key === 'not_and' || key === 'not';
}
