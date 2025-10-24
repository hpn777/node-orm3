export interface Dialect {
  escapeId: (...identifiers: any[]) => string;
  escapeVal: (value: any, timezone?: string) => string;
  escape?: (query: string, args: any[]) => string;
  limitAsTop?: boolean;
  autoIncrement?: string;
  defaultValuesStmt?: string;
  DataTypes?: Record<string, string | boolean>;
  [key: string]: unknown;
}

export interface QueryOptions {
  dialect?: string;
  timezone?: string;
  [key: string]: unknown;
}
