import { CreateQuery } from './Create';
import { SelectQuery } from './Select';
import { InsertQuery } from './Insert';
import { UpdateQuery } from './Update';
import { RemoveQuery } from './Remove';
import comparatorFunctions, { ComparatorFunctions as ComparatorFunctionMap } from './Comparators';
import * as Helpers from './Helpers';
import type { Dialect, QueryOptions } from './types';

export type ComparatorKeys = keyof ComparatorFunctionMap;

export interface QueryDialect extends Dialect {
  escape: (query: string, args: any[]) => string;
}

export interface QueryApi {
  escape: (query: string, args: any[]) => string;
  escapeId: (...identifiers: any[]) => string;
  escapeVal: (value: any, timezone?: string) => string;
  create: () => ReturnType<typeof CreateQuery>;
  select: () => ReturnType<typeof SelectQuery>;
  insert: () => ReturnType<typeof InsertQuery>;
  update: () => ReturnType<typeof UpdateQuery>;
  remove: () => ReturnType<typeof RemoveQuery>;
}

export interface QueryStatic extends QueryApi {
  Text: ReturnType<typeof buildQueryType>;
  Comparators: ComparatorKeys[];
  [key: string]: any;
}

type QueryFactory = ((opts?: string | QueryOptions) => QueryApi) & {
  Comparators: ComparatorKeys[];
  Text: ReturnType<typeof buildQueryType>;
  Query?: QueryFactory;
  [key: string]: any;
};

const factory = (opts?: string | QueryOptions): QueryApi => {
  let options: QueryOptions;
  if (typeof opts === 'string') {
    options = { dialect: opts };
  } else {
    options = opts || {};
  }

  const dialectModule = require(`./Dialects/${options.dialect || 'mysql'}`);
  const Dialect: QueryDialect = (dialectModule && dialectModule.default) ? dialectModule.default : dialectModule;

  return {
    escape: (query: string, args: any[]) => Helpers.escapeQuery(Dialect, query, args),
    escapeId: (...identifiers: any[]) => Dialect.escapeId(...identifiers),
    escapeVal: (value: any, timezone?: string) => Dialect.escapeVal(value, timezone),
    create: () => CreateQuery(Dialect),
    select: () => SelectQuery(Dialect, options),
    insert: () => InsertQuery(Dialect, options),
    update: () => UpdateQuery(Dialect, options),
    remove: () => RemoveQuery(Dialect, options)
  };
};

export const Comparators = Object.keys(comparatorFunctions) as ComparatorKeys[];
export const Text = buildQueryType('text');

const QueryFactory: QueryFactory = Object.assign(factory, {
  Comparators,
  Text
});

for (const comparator of Comparators) {
  QueryFactory[comparator] = (comparatorFunctions as Record<string, unknown>)[comparator];
}

QueryFactory.Query = QueryFactory;

export const Query = QueryFactory;

function buildQueryType(type: string) {
  return function build(data: unknown) {
    const result = { data } as { data: unknown; type: () => string };

    Object.defineProperty(result, 'type', {
      value: function typeGetter() {
        return type;
      },
      enumerable: false
    });

    return result;
  };
}
export default QueryFactory;
