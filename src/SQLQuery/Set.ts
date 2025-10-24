import type { Dialect, QueryOptions } from './types';

export function build(dialect: Dialect, set: Record<string, any>, opts?: QueryOptions): string | string[] {
  const options = opts || {};

  if (!set || Object.keys(set).length === 0) {
    return [];
  }

  const parts: string[] = [];

  for (const key in set) {
    if (!Object.prototype.hasOwnProperty.call(set, key)) {
      continue;
    }

    parts.push(`${dialect.escapeId(key)} = ${dialect.escapeVal(set[key], options.timezone)}`);
  }

  return `SET ${parts.join(', ')}`;
}
