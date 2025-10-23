import Validator from './Validator';
import type {
  ContextMap,
  IValidator,
  Options,
  ValidationCallback,
  ValidationError,
  ValidatorMap
} from './types';

export default class Enforce {
  private validations: ValidatorMap = {};
  private contexts: ContextMap = {};
  private readonly options: Options;

  constructor(options?: Options) {
    this.options = {
      returnAllErrors: Boolean(options && options.returnAllErrors)
    };
  }

  add(property: string, validator: ValidationCallback | IValidator): this {
    let normalized: IValidator;

    if (typeof validator === 'function' && validator.length >= 2) {
      normalized = new Validator(validator);
    } else if (validator && typeof (validator as IValidator).validate === 'function') {
      normalized = validator as IValidator;
    } else {
      throw new Error('Missing validator (function) in Enforce.add(property, validator)');
    }

    if (!Object.prototype.hasOwnProperty.call(this.validations, property)) {
      this.validations[property] = [];
    }

    this.validations[property].push(normalized);
    return this;
  }

  context(): ContextMap;
  context(name: string): unknown;
  context(name: string, value: unknown): this;
  context(name?: string, value?: unknown): ContextMap | unknown | this {
    if (typeof name === 'string' && arguments.length === 2) {
      this.contexts[name] = value;
      return this;
    }
    if (typeof name === 'string') {
      return this.contexts[name];
    }
    return this.contexts;
  }

  clear(): void {
    this.validations = {};
  }

  check(data: Record<string, unknown>, cb: (error: ValidationError | ValidationError[] | null) => void): void {
    const queue: Array<{ property: string; validator: IValidator }> = [];
    const errors: ValidationError[] = [];

    for (const property of Object.keys(this.validations)) {
      const validators = this.validations[property];
      for (const validator of validators) {
        queue.push({ property, validator });
      }
    }

    const next = (): void => {
      if (queue.length === 0) {
        if (errors.length > 0) {
          if (this.options.returnAllErrors) {
            cb(errors);
          } else {
            cb(errors[0]);
          }
          return;
        }
        cb(null);
        return;
      }

      const { property, validator } = queue.shift()!;
      this.contexts.property = property;

      const handleResult = (message?: string): void => {
        if (message) {
          const err: ValidationError = new Error(message);
          err.property = property;
          err.value = data[property];
          err.msg = message;
          err.type = 'validation';

          if (!this.options.returnAllErrors) {
            cb(err);
            return;
          }

          errors.push(err);
        }
        next();
      };

      validator.validate(data[property], handleResult, data, this.contexts);
    };

    next();
  }
}
