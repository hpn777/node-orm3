export interface Options {
  returnAllErrors?: boolean;
}

export interface ContextMap {
  property?: string;
  [name: string]: unknown;
}

export type ValidationCallback = (
  value: unknown,
  next: (message?: string) => void,
  contexts?: ContextMap
) => void;

export interface IValidator {
  validate(value: unknown, next: (message?: string) => void, thisArg?: unknown, contexts?: ContextMap): void;
  ifDefined(): IValidator;
  ifNotEmptyString(): IValidator;
  ifType(type: string): IValidator;
  ifNotType(type: string): IValidator;
}

export interface ValidatorMap {
  [property: string]: IValidator[];
}

export interface ValidationError extends Error {
  property?: string;
  value?: unknown;
  msg?: string;
  type?: string;
}

export interface SecurityUsernameOptions {
  length: number;
  expr?: RegExp | null;
}
