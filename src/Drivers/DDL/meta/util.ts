export type UnknownRecord = Record<string, unknown>;

export function lowercaseKeys<T extends UnknownRecord>(obj: T): UnknownRecord {
  const entries = Object.entries(obj).map(([key, value]) => [key.toLowerCase(), value]);
  return Object.fromEntries(entries);
}
