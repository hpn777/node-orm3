import * as Helpers from './Helpers';
import { build as buildWhere } from './Where';
import type { Dialect, QueryOptions } from './types';

const aggregateFunctions = [
  'ABS', 'CEIL', 'FLOOR', 'ROUND',
  'AVG', 'MIN', 'MAX',
  'LOG', 'LOG2', 'LOG10', 'EXP', 'POWER',
  'ACOS', 'ASIN', 'ATAN', 'COS', 'SIN', 'TAN',
  'CONV', 'RANDOM', 'RAND', 'RADIANS', 'DEGREES',
  'SUM', 'COUNT', 'DISTINCT'
] as const;

type AggregateFunction = (typeof aggregateFunctions)[number];

export interface SelectFromEntry {
  t: string;
  a: string;
  select?: any[];
  j?: any[];
  opts?: Record<string, any>;
}

export interface SelectQueryBuilder {
  select: (...fields: any[]) => SelectQueryBuilder;
  calculateFoundRows: () => SelectQueryBuilder;
  as: (alias: string | null) => SelectQueryBuilder;
  fun: (fun: string, column?: any, alias?: string | null) => SelectQueryBuilder;
  from: (...args: any[]) => SelectQueryBuilder;
  where: (...args: any[]) => SelectQueryBuilder;
  whereExists: (table: string, tableLink: string, link: any[], conditions: Record<string, any>) => SelectQueryBuilder;
  groupBy: (...columns: any[]) => SelectQueryBuilder;
  offset: (offset: number) => SelectQueryBuilder;
  limit: (limit: number) => SelectQueryBuilder;
  order: (column: any, dir: any) => SelectQueryBuilder;
  build: () => string;
  [key: string]: any;
}

export function SelectQuery(dialect: Dialect, opts: QueryOptions = {}): SelectQueryBuilder {
  const sql: {
    from: SelectFromEntry[];
    where: { t: string | null; w: Record<string, any>; e?: { t: string; tl: string; l: any[] } }[];
    order: any[];
    group_by: any[] | null;
    found_rows: boolean;
    where_exists: boolean;
    offset?: number;
    limit?: number;
  } = {
    from: [],
    where: [],
    order: [],
    group_by: null,
    found_rows: false,
    where_exists: false
  };

  const getTableAlias = (table: string): string => {
    for (let i = 0; i < sql.from.length; i += 1) {
      if (sql.from[i].t === table) {
        return sql.from[i].a;
      }
    }
    return table;
  };

  let functionStack: string[] = [];

  const aggregateFun = (fun: AggregateFunction) => {
    return function aggregateFunction(this: SelectQueryBuilder, ...fnArgs: any[]): SelectQueryBuilder {
      if (fnArgs.length === 0) {
        functionStack.push(fun);
        return this;
      }

      let column: any[] = Array.prototype.slice.call(fnArgs);
      const alias = column.length > 1 && typeof column[column.length - 1] === 'string' ? column.pop() : null;

      if (column.length && Array.isArray(column[0])) {
        column = column[0].concat(column.slice(1));
      }

      return this.fun(fun, column.length && column[0] ? column : '*', alias);
    };
  };

  const builder: SelectQueryBuilder = {
    select(this: SelectQueryBuilder, fields?: any): SelectQueryBuilder {
      if (fields) {
        if (!sql.from[sql.from.length - 1].select) {
          sql.from[sql.from.length - 1].select = [];
        }
        const values = Array.isArray(fields) ? fields : Array.prototype.slice.call(arguments);
        sql.from[sql.from.length - 1].select = sql.from[sql.from.length - 1].select!.concat(values);
      }
      return this;
    },

    calculateFoundRows(this: SelectQueryBuilder): SelectQueryBuilder {
      sql.found_rows = true;
      return this;
    },

    as(this: SelectQueryBuilder, alias: string | null): SelectQueryBuilder {
      const idx = sql.from.length - 1;

      if (sql.from[idx].select && sql.from[idx].select!.length) {
        const idx2 = sql.from[idx].select!.length - 1;

        if (typeof sql.from[idx].select![idx2] === 'string') {
          sql.from[idx].select![idx2] = { c: sql.from[idx].select![idx2] };
        }

        sql.from[idx].select![sql.from[idx].select!.length - 1].a = alias || null;
      }

      return this;
    },

    fun(this: SelectQueryBuilder, fun: string, column?: any, alias?: string | null): SelectQueryBuilder {
      if (!Array.isArray(sql.from[sql.from.length - 1].select)) {
        sql.from[sql.from.length - 1].select = [];
      }

      sql.from[sql.from.length - 1].select!.push({
        f: fun.toUpperCase(),
        c: column && column !== '*' ? column : null,
        a: alias || null,
        s: functionStack
      });
      functionStack = [];
      return this;
    },

    from(this: SelectQueryBuilder, ...args: any[]): SelectQueryBuilder {
      const table = args[0];
      const from: SelectFromEntry = {
        t: table,
        a: `t${sql.from.length + 1}`
      };

      if (sql.from.length === 0) {
        sql.from.push(from);
        return this;
      }

      let f = args[1];
      let toTable = args[2];
      let toId = args[3];
      const last = args[args.length - 1];

      if (typeof last === 'object' && !Array.isArray(last)) {
        from.opts = args.pop();
      }

      let alias: string;
      let target: any;

      if (args.length === 3) {
        alias = sql.from[sql.from.length - 1].a;
        target = toTable;
      } else {
        alias = getTableAlias(toTable);
        target = toId;
      }

      from.j = [];

      if (f && f.length && target && target.length) {
        if (Array.isArray(f) && Array.isArray(target) && f.length === target.length) {
          for (let i = 0; i < f.length; i += 1) {
            from.j.push([f[i], alias, target[i]]);
          }
        } else {
          from.j.push([f, alias, target]);
        }
      } else {
        throw new Error('Invalid join definition');
      }

      sql.from.push(from);
      return this;
    },

    where(this: SelectQueryBuilder, ...args: any[]): SelectQueryBuilder {
      let whereClause: { t: string | null; w: any } | null = null;

      for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];

        if (arg === null) {
          continue;
        }

        if (typeof arg === 'string') {
          if (whereClause !== null) {
            sql.where.push(whereClause);
          }
          whereClause = {
            t: getTableAlias(arg),
            w: args[i + 1]
          };
          i += 1;
        } else {
          if (whereClause !== null) {
            sql.where.push(whereClause);
          }
          whereClause = {
            t: null,
            w: arg
          };
        }
      }

      if (whereClause !== null) {
        sql.where.push(whereClause);
      }

      return this;
    },

    whereExists(this: SelectQueryBuilder, table: string, tableLink: string, link: any[], conditions: Record<string, any>): SelectQueryBuilder {
      sql.where.push({
        t: sql.from.length ? sql.from[sql.from.length - 1].a : null,
        w: conditions,
        e: { t: table, tl: getTableAlias(tableLink), l: link }
      });
      sql.where_exists = true;
      return this;
    },

    groupBy(this: SelectQueryBuilder, ...columns: any[]): SelectQueryBuilder {
      sql.group_by = columns;
      return this;
    },

    offset(this: SelectQueryBuilder, offset: number): SelectQueryBuilder {
      sql.offset = offset;
      return this;
    },

    limit(this: SelectQueryBuilder, limit: number): SelectQueryBuilder {
      sql.limit = limit;
      return this;
    },

    order(this: SelectQueryBuilder, column: any, dir: any): SelectQueryBuilder {
      if (Array.isArray(dir)) {
        sql.order.push(Helpers.escapeQuery(dialect, column, dir));
      } else {
        sql.order.push({
          c: Array.isArray(column) ? [getTableAlias(column[0]), column[1]] : column,
          d: dir === 'Z' ? 'DESC' : 'ASC'
        });
      }
      return this;
    },

    build(this: SelectQueryBuilder): string {
      const query: string[] = [];
      const having: string[] = [];

      if (functionStack.length) {
        const pending = functionStack.pop();
        if (pending) {
          this.fun(pending);
        }
      }

      query.push('SELECT');

      if (dialect.limitAsTop && Object.prototype.hasOwnProperty.call(sql, 'limit')) {
        query.push(`TOP ${sql.limit}`);
      }

      for (let i = 0; i < sql.from.length; i += 1) {
        sql.from[i].a = `t${i + 1}`;
      }

      const selectParts: string[] = [];
      for (let i = 0; i < sql.from.length; i += 1) {
        const fromEntry = sql.from[i];
        if (!fromEntry.select) {
          continue;
        }

        for (let j = 0; j < fromEntry.select.length; j += 1) {
          const selection = fromEntry.select[j];

          if (typeof selection === 'string') {
            if (sql.from.length === 1) {
              selectParts.push(dialect.escapeId(selection));
            } else {
              selectParts.push(dialect.escapeId(fromEntry.a, selection));
            }
            continue;
          }

          if (typeof selection === 'object') {
            if (!selection.f && selection.c) {
              if (sql.from.length === 1) {
                selectParts.push(dialect.escapeId(selection.c));
              } else {
                selectParts.push(dialect.escapeId(fromEntry.a, selection.c));
              }
              if (selection.a) {
                selectParts[selectParts.length - 1] += ` AS ${dialect.escapeId(selection.a)}`;
              }
            }
            if (selection.having) {
              having.push(dialect.escapeId(selection.having));
            }
            if (selection.select) {
              selectParts.push(dialect.escapeId(selection.select));
              continue;
            }
          }

          if (typeof selection === 'function') {
            selectParts.push(selection(dialect));
            continue;
          }

          let str = `${selection.f}(`;

          if (selection.f) {
            if (selection.c && !Array.isArray(selection.c)) {
              selection.c = [selection.c];
            }

            if (Array.isArray(selection.c)) {
              str += selection.c
                .map((el: any) => {
                  if (!el) {
                    return dialect.escapeVal(el);
                  }
                  if (typeof el.type === 'function') {
                    switch (el.type()) {
                      case 'text':
                        return dialect.escapeVal(el.data, opts.timezone);
                      default:
                        return el;
                    }
                  }
                  if (typeof el !== 'string') {
                    return el;
                  }
                  if (sql.from.length === 1) {
                    return dialect.escapeId(el);
                  }
                  return dialect.escapeId(fromEntry.a, el);
                })
                .join(', ');
            } else {
              str += '*';
            }
            str += ')';
          } else if (selection.sql) {
            str = `(${selection.sql})`;
          } else {
            continue;
          }

          str += selection.a ? ` AS ${dialect.escapeId(selection.a)}` : '';

          if (selection.s && selection.s.length > 0) {
            str = `${selection.s.join('(')}(${str}${')'.repeat(selection.s.length + 1)})`;
          }

          selectParts.push(str);
        }
      }

      if (sql.found_rows) {
        query.push('SQL_CALC_FOUND_ROWS');
      }

      if (selectParts.length) {
        query.push(selectParts.join(', '));
      } else {
        query.push('*');
      }

      if (sql.from.length > 0) {
        query.push('FROM');

        if (sql.from.length > 2) {
          query.push('('.repeat(sql.from.length - 2));
        }

        for (let i = 0; i < sql.from.length; i += 1) {
          const fromEntry = sql.from[i];

          if (i > 0) {
            if (fromEntry.opts && fromEntry.opts.joinType) {
              query.push(fromEntry.opts.joinType.toUpperCase());
            }
            query.push('JOIN');
          }
          if (sql.from.length === 1 && !sql.where_exists) {
            query.push(dialect.escapeId(fromEntry.t));
          } else {
            query.push(`${dialect.escapeId(fromEntry.t)} ${dialect.escapeId(fromEntry.a)}`);
          }
          if (i > 0 && fromEntry.j) {
            query.push('ON');

            for (let ii = 0; ii < fromEntry.j.length; ii += 1) {
              if (ii > 0) {
                query.push('AND');
              }
              query.push(
                `${dialect.escapeId(fromEntry.a, fromEntry.j[ii][0])} = ${dialect.escapeId(fromEntry.j[ii][1], fromEntry.j[ii][2])}`
              );
            }

            if (i < sql.from.length - 1) {
              query.push(')');
            }
          }
        }
      }

      if (having.length > 0) {
        for (let i = 0; i < having.length; i += 1) {
          query.push(`${i === 0 ? 'HAVING' : 'AND'}${having[i]}`);
        }
      }

      const whereClause = buildWhere(dialect, sql.where, opts);
      if (Array.isArray(whereClause)) {
        query.push(...whereClause);
      } else if (whereClause) {
        query.push(whereClause);
      }

      if (sql.group_by !== null) {
        query.push(
          `GROUP BY ${sql.group_by
            .map((column: any) => {
              if (typeof column === 'string' && column[0] === '-') {
                sql.order.unshift({ c: column.substr(1), d: 'DESC' });
                return dialect.escapeId(column.substr(1));
              }
              return dialect.escapeId(column);
            })
            .join(', ')}`
        );
      }

      if (sql.order.length > 0) {
        const orderParts: string[] = [];
        for (let i = 0; i < sql.order.length; i += 1) {
          const ord = sql.order[i];

          if (typeof ord === 'object') {
            if (Array.isArray(ord.c)) {
              orderParts.push(`${dialect.escapeId.apply(dialect, ord.c)} ${ord.d}`);
            } else {
              orderParts.push(`${dialect.escapeId(ord.c)} ${ord.d}`);
            }
          } else if (typeof ord === 'string') {
            orderParts.push(ord);
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
    }
  } as SelectQueryBuilder;

  for (let i = 0; i < aggregateFunctions.length; i += 1) {
    const funName = aggregateFunctions[i].toLowerCase();
    builder[funName] = aggregateFun(aggregateFunctions[i]);
  }

  return builder;
}
