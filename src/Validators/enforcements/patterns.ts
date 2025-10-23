import Validator from '../Validator';
import type { IValidator } from '../types';

type MatchArgs = [pattern: string, modifiers?: string, message?: string] | [pattern: RegExp, message?: string];

function normalizeArgs(args: MatchArgs): { pattern: RegExp; message: string } {
  if (typeof args[0] === 'string') {
    const [pattern, maybeModifiers, maybeMessage] = args as [string, string | undefined, string | undefined];
    if (args.length === 2) {
      const message = maybeModifiers ?? 'no-pattern-match';
      return { pattern: new RegExp(pattern, 'i'), message };
    }
    const modifiers = maybeModifiers ?? 'i';
    const message = maybeMessage ?? 'no-pattern-match';
    return { pattern: new RegExp(pattern, modifiers), message };
  }

  const [regexp, maybeMessage] = args as [RegExp, string | undefined];
  return { pattern: regexp, message: maybeMessage ?? 'no-pattern-match' };
}

export function match(...args: MatchArgs): IValidator {
  const { pattern, message } = normalizeArgs(args);
  return new Validator((value, next) => {
    if (typeof value === 'string' && pattern.test(value)) return next();
    return next(message);
  });
}

export function hexString(message = 'not-hex-string'): IValidator {
  return match('^[a-f0-9]+$', 'i', message);
}

export function email(message = 'not-valid-email'): IValidator {
  return match('^[a-z0-9\._%\+\-]+@[a-z0-9\.\-]+\.[a-z]{2,6}$', 'i', message);
}

export function ipv4(message = 'not-valid-ipv4'): IValidator {
  const p1 = '([1-9]|1[0-9][0-9]?|2[0-4][0-9]|25[0-4])';
  const p2 = '([0-9]|1[0-9][0-9]?|2[0-4][0-9]|25[0-4])';
  return match(`^${[p1, p2, p2, p1].join('\\.')}$`, '', message);
}

export function ipv6(message = 'not-valid-ipv6'): IValidator {
  const p1 = /^([a-f0-9]{1,4}:){7}[a-f0-9]{1,4}$/i;
  const p2 = /^([a-f0-9]{1,4}:)*[a-f0-9]{1,4}$/i;

  return new Validator((value, next) => {
    if (typeof value !== 'string') return next(message);
    if (value === '::' || value === '::1') return next();
    if (p1.test(value)) return next();
    if (value.indexOf('::') === -1) return next(message);

    const group = value.split('::');
    if (group.length !== 2) return next(message);
    if (!p2.test(group[0]) || !p2.test(group[1])) return next(message);
    return next();
  });
}

export function mac(message = 'not-valid-mac'): IValidator {
  const p = '[0-9a-f]{1,2}';
  const s = '[\\.:]';
  return match(`^${[p, p, p, p, p, p].join(s)}$`, 'i', message);
}

export function uuid3(message = 'not-valid-uuid3'): IValidator {
  return match('^[a-f0-9]{8}\-[a-f0-9]{4}\-3[a-f0-9]{3}\-[89ab][a-f0-9]{3}\-[a-f0-9]{12}$', 'i', message);
}

export function uuid4(message = 'not-valid-uuid3'): IValidator {
  return match('^[a-f0-9]{8}\-[a-f0-9]{4}\-4[a-f0-9]{3}\-[89ab][a-f0-9]{3}\-[a-f0-9]{12}$', 'i', message);
}
