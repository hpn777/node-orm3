/**
 * Deprecated promise compatibility layer
 */

export function promisify(fn: Function, context?: any): (...args: any[]) => Promise<any> {
  return function (this: any, ...args: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      args.push((err: Error | null, ...results: any[]) => {
        if (err) return reject(err);
        resolve(results.length <= 1 ? results[0] : results);
      });
      fn.apply(context || this, args);
    });
  };
}

export default { promisify };
