export type ComparatorTag =
  | 'between'
  | 'not_between'
  | 'like'
  | 'not_like'
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'not_in'
  | 'sql';

export interface ComparatorObject {
  sql_comparator: () => ComparatorTag;
  [key: string]: unknown;
}

type ComparatorFactory<T extends ComparatorObject> = (...args: any[]) => T;

function createSpecialObject<T extends Record<string, unknown>>(obj: T, tag: ComparatorTag): T & ComparatorObject {
  Object.defineProperty(obj, 'sql_comparator', {
    configurable: false,
    enumerable: false,
    value: () => tag
  });

  return obj as T & ComparatorObject;
}

export const between: ComparatorFactory<ComparatorObject> = (from: unknown, to: unknown) =>
  createSpecialObject({ from, to }, 'between');

export const not_between: ComparatorFactory<ComparatorObject> = (from: unknown, to: unknown) =>
  createSpecialObject({ from, to }, 'not_between');

export const like: ComparatorFactory<ComparatorObject> = (expr: unknown) =>
  createSpecialObject({ expr }, 'like');

export const not_like: ComparatorFactory<ComparatorObject> = (expr: unknown) =>
  createSpecialObject({ expr }, 'not_like');

export const eq: ComparatorFactory<ComparatorObject> = (val: unknown) =>
  createSpecialObject({ val }, 'eq');

export const ne: ComparatorFactory<ComparatorObject> = (val: unknown) =>
  createSpecialObject({ val }, 'ne');

export const gt: ComparatorFactory<ComparatorObject> = (val: unknown) =>
  createSpecialObject({ val }, 'gt');

export const gte: ComparatorFactory<ComparatorObject> = (val: unknown) =>
  createSpecialObject({ val }, 'gte');

export const lt: ComparatorFactory<ComparatorObject> = (val: unknown) =>
  createSpecialObject({ val }, 'lt');

export const lte: ComparatorFactory<ComparatorObject> = (val: unknown) =>
  createSpecialObject({ val }, 'lte');

export const not_in: ComparatorFactory<ComparatorObject> = (val: unknown) =>
  createSpecialObject({ val }, 'not_in');

export type ComparatorFunctions = {
  between: typeof between;
  not_between: typeof not_between;
  like: typeof like;
  not_like: typeof not_like;
  eq: typeof eq;
  ne: typeof ne;
  gt: typeof gt;
  gte: typeof gte;
  lt: typeof lt;
  lte: typeof lte;
  not_in: typeof not_in;
};

export const comparatorFunctions: ComparatorFunctions = {
  between,
  not_between,
  like,
  not_like,
  eq,
  ne,
  gt,
  gte,
  lt,
  lte,
  not_in
};

export default comparatorFunctions;
