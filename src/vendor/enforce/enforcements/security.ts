import * as patterns from './patterns';
import Validator from '../Validator';
import type { IValidator, SecurityUsernameOptions } from '../types';

type CreditCardPrefixes = Record<string, string[]>;

const creditcardPrefixes: CreditCardPrefixes = {
  amex: ['34', '37'],
  maestro: ['5018', '5020', '5038', '5893', '6304', '6759', '6761', '6762', '6763'],
  mastercard: ['51', '52', '53', '54', '55'],
  discover4: ['6011'],
  discover3: ['644', '645', '646', '647', '648', '649'],
  discover2: ['65']
};

export function username(message?: string): IValidator;
export function username(options: SecurityUsernameOptions, message?: string): IValidator;
export function username(
  options: SecurityUsernameOptions | string = { length: 2, expr: null },
  message: string = 'invalid-username'
): IValidator {
  if (typeof options === 'string') {
    message = options;
    options = { length: 2, expr: null };
  }

  const config = options as SecurityUsernameOptions;

  if (!config.expr) {
    config.expr = new RegExp(`^[a-z_][a-z0-9_\\-]{${config.length - 1},}$`, 'i');
  }

  return patterns.match(config.expr, message);
}

export function password(message?: string): IValidator;
export function password(checks: string, message?: string): IValidator;
export function password(checks?: string, message?: string): IValidator {
  let rules = checks;
  let errorMessage = message;

  if (!errorMessage) {
    errorMessage = rules;
    rules = 'luns6';
  }

  if (!errorMessage) {
    errorMessage = 'weak-password';
  }

  const match = rules ? rules.match(/([0-9]+)/) : null;
  const minLength = match ? parseInt(match[1], 10) : null;

  const normalizedRules = rules ?? '';
  const normalizedMessage = errorMessage;

  return new Validator((value, next) => {
    if (typeof value !== 'string' || value.length === 0) return next(normalizedMessage);

    if (normalizedRules.indexOf('l') >= 0 && !/[a-z]/.test(value)) return next(normalizedMessage);
    if (normalizedRules.indexOf('u') >= 0 && !/[A-Z]/.test(value)) return next(normalizedMessage);
    if (normalizedRules.indexOf('n') >= 0 && !/[0-9]/.test(value)) return next(normalizedMessage);
    if (normalizedRules.indexOf('s') >= 0 && !/[^a-zA-Z0-9]/.test(value)) return next(normalizedMessage);
    if (minLength !== null && value.length < minLength) return next(normalizedMessage);

    return next();
  });
}

export function creditcard(message?: string): IValidator;
export function creditcard(types: string[], message?: string): IValidator;
export function creditcard(
  typesOrMessage: string[] | string | undefined = ['amex', 'visa', 'maestro', 'discover', 'mastercard'],
  maybeMessage = 'not-valid-creditcard'
): IValidator {
  let types: string[];
  let message: string;

  if (Array.isArray(typesOrMessage)) {
    types = typesOrMessage;
    message = maybeMessage ?? 'not-valid-creditcard';
  } else if (typeof typesOrMessage === 'string') {
    types = ['amex', 'visa', 'maestro', 'discover', 'mastercard'];
    message = typesOrMessage;
  } else {
    types = ['amex', 'visa', 'maestro', 'discover', 'mastercard'];
    message = maybeMessage ?? 'not-valid-creditcard';
  }

  return new Validator((value, next) => {
    if (!value) return next(message);

    const v = String(value);
    let ok = false;

    for (const type of types) {
      switch (type) {
        case 'amex':
          if (v.length !== 15) break;
          ok = creditcardPrefixes.amex.indexOf(v.substr(0, 2)) >= 0;
          break;
        case 'visa':
          if (v.length < 13 || v.length > 16) break;
          ok = v[0] === '4';
          break;
        case 'maestro':
          if (v.length < 16 || v.length > 19) break;
          ok = creditcardPrefixes.maestro.indexOf(v.substr(0, 4)) >= 0;
          break;
        case 'mastercard':
          if (v.length < 16 || v.length > 19) break;
          ok = creditcardPrefixes.mastercard.indexOf(v.substr(0, 2)) >= 0;
          break;
        case 'discover':
          if (v.length !== 16) break;
          ok =
            creditcardPrefixes.discover4.indexOf(v.substr(0, 4)) >= 0 ||
            creditcardPrefixes.discover3.indexOf(v.substr(0, 3)) >= 0 ||
            creditcardPrefixes.discover2.indexOf(v.substr(0, 2)) >= 0;

          if (!ok) {
            const prefix = Number(v.substr(0, 6));
            ok = !Number.isNaN(prefix) && prefix >= 622126 && prefix <= 622925;
          }
          break;
        case 'luhn':
          ok = true;
          break;
        default:
          ok = false;
      }

      if (ok) break;
    }

    if (!ok) return next(message);

    const check = Number(v[v.length - 1]);
    if (Number.isNaN(check)) return next(message);

    const digits = v
      .slice(0, v.length - 1)
      .split('')
      .reverse()
      .map((digit) => Number(digit));

    for (let i = 0; i < digits.length; i += 1) {
      if (Number.isNaN(digits[i])) return next(message);
      if (i % 2 === 0) {
        digits[i] *= 2;
        if (digits[i] > 9) {
          digits[i] -= 9;
        }
      }
    }

    const sum = digits.reduce((acc, curr) => acc + curr, check);
    return next(sum % 10 !== 0 ? message : undefined);
  });
}
