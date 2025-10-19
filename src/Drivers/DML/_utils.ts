/**
 * DML utilities
 */

import { promisify } from 'util';

export function promisifyFunctions(target: any, functions: string[]): void {
  functions.forEach((fnName) => {
    target[fnName + 'Async'] = promisify(target[fnName]);
  });
}

export default { promisifyFunctions };
