import * as common from './enforcements/common';
import * as lists from './enforcements/lists';
import * as patterns from './enforcements/patterns';
import * as ranges from './enforcements/ranges';
import * as security from './enforcements/security';
import Enforce from './Enforce';
import Validator from './Validator';

type EnforceModule = typeof common & {
  Enforce: typeof Enforce;
  Validator: typeof Validator;
  lists: typeof lists;
  ranges: typeof ranges;
  patterns: typeof patterns;
  security: typeof security;
};

const enforce: EnforceModule = Object.assign({
  Enforce,
  Validator,
  lists,
  ranges,
  patterns,
  security
}, common);

export type * from './types';
export * from './enforcements/common';
export * from './enforcements/lists';
export * from './enforcements/patterns';
export * from './enforcements/ranges';
export * from './enforcements/security';
export { Enforce, Validator, lists, ranges, patterns, security };
export default enforce;
