/**
 * Thin wrapper around the legacy `enforce` package so TypeScript does not
 * attempt to compile its bundled TypeScript sources. All typing information
 * lives here while runtime behavior is still provided by the original module.
 */

type EnforceValidator = (value: any, next: (message?: string | null) => void, context?: unknown) => void;

interface EnforceInstance {
  add(field: string, validator: EnforceValidator): void;
  context(name: string, value: unknown): void;
  check(subject: unknown, cb: (err?: unknown) => void): void;
}

interface EnforceModule {
  Enforce: new (options?: { returnAllErrors?: boolean }) => EnforceInstance;
  Validator?: new (...args: any[]) => unknown;
  required(message?: string): EnforceValidator;
  notEmptyString(message?: string): EnforceValidator;
  ranges: {
    number(min: number, max: number, message?: string): EnforceValidator;
    length(min: number, max: number, message?: string): EnforceValidator;
  };
  lists: {
    inside(list: any[], message?: string): EnforceValidator;
    outside(list: any[], message?: string): EnforceValidator;
  };
  security: {
    password(conditions?: string, message?: string): EnforceValidator;
    [key: string]: any;
  };
  patterns(expr: RegExp | string, flags?: string, message?: string): EnforceValidator;
  equalToProperty?: (name: string, message?: string) => EnforceValidator;
  unique?: (opts?: any, message?: string) => EnforceValidator;
  [key: string]: any;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const enforce: EnforceModule = require('enforce');

export type { EnforceModule, EnforceInstance, EnforceValidator };
export default enforce;
