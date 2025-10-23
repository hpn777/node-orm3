import type { ContextMap, IValidator, ValidationCallback } from './types';

export default class Validator implements IValidator {
  private readonly validator: ValidationCallback;

  constructor(validate: ValidationCallback) {
    this.validator = validate;
  }

  validate(value: unknown, next: (message?: string) => void, thisArg?: unknown, contexts: ContextMap = {}): void {
    this.validator.apply(thisArg, [value, next, contexts]);
  }

  ifDefined(): IValidator {
    return new Validator((value, next, contexts) => {
      if (value === undefined || value === null) return next();
      return this.validator(value, next, contexts);
    });
  }

  ifNotEmptyString(): IValidator {
    return new Validator((value, next, contexts) => {
      if (value === undefined || value === null) return next();
      if (typeof value !== 'string') return next();
      if (value.length === 0) return next();
      return this.validator(value, next, contexts);
    });
  }

  ifType(type: string): IValidator {
    return new Validator((value, next, contexts) => {
      if (typeof value !== type) return next();
      return this.validator(value, next, contexts);
    });
  }

  ifNotType(type: string): IValidator {
    return new Validator((value, next, contexts) => {
      if (typeof value !== type) return this.validator(value, next, contexts);
      return next();
    });
  }
}
