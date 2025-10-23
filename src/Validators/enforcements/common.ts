import Validator from '../Validator';
import * as ranges from './ranges';
import type { IValidator } from '../types';

export function required(message = 'required'): IValidator {
  return new Validator((value, next) => {
    if (value === null || value === undefined) return next(message);
    return next();
  });
}

export function notEmptyString(message = 'empty-string'): IValidator {
  return ranges.length(1, undefined, message);
}

export function sameAs(property: string, message = 'not-same-as'): IValidator {
  return new Validator(function (this: Record<string, unknown>, value, next) {
    if (value !== this[property]) return next(message);
    return next();
  });
}
