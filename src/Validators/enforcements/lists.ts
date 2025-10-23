import Validator from '../Validator';
import type { IValidator } from '../types';

export function inside(list: unknown[], message = 'outside-list'): IValidator {
  return new Validator((value, next) => {
    if (list.indexOf(value) >= 0) return next();
    return next(message);
  });
}

export function outside(list: unknown[], message = 'inside-list'): IValidator {
  return new Validator((value, next) => {
    if (list.indexOf(value) === -1) return next();
    return next(message);
  });
}
