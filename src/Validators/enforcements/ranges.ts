import Validator from '../Validator';
import type { IValidator } from '../types';

export function number(min: number | undefined, max: number | undefined, message = 'out-of-range-number'): IValidator {
  return new Validator((value: unknown, next) => {
    if (value === undefined || value === null) return next('undefined');
    const numeric = value as number;
    if (min === undefined && max !== undefined && numeric <= max) return next();
    if (max === undefined && min !== undefined && numeric >= min) return next();
    if (min !== undefined && max !== undefined && numeric >= min && numeric <= max) return next();
    return next(message);
  });
}

export function length(min: number | undefined, max: number | undefined, message = 'out-of-range-length'): IValidator {
  return new Validator((value: unknown, next) => {
    if (value === undefined || value === null) return next('undefined');
    const len = (value as { length: number }).length;
    if (min === undefined && max !== undefined && len <= max) return next();
    if (max === undefined && min !== undefined && len >= min) return next();
    if (min !== undefined && max !== undefined && len >= min && len <= max) return next();
    return next(message);
  });
}
