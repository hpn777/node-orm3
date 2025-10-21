/**
 * Promise utilities for internal use during async migration
 * 
 * These utilities help bridge callback-based and promise-based patterns
 * during the migration phase.
 */

/**
 * Convert a callback-based function to promise-based
 * Usage: const result = await callbackToPromise(fn, arg1, arg2, ...);
 */
export function callbackToPromise<T>(
  fn: (callback: (err: Error | null, result?: T) => void) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    fn((err: Error | null, result?: T) => {
      if (err) {
        reject(err);
      } else {
        resolve(result as T);
      }
    });
  });
}

/**
 * Convert a void callback to promise
 * Usage: await callbackToPromiseVoid(fn, arg1, arg2, ...);
 */
export function callbackToPromiseVoid(
  fn: (callback: (err?: Error | null) => void) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    fn((err?: Error | null) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Execute an array of async operations in series
 * Usage: await eachSeries(items, async (item) => { ... });
 */
export async function eachSeries<T>(
  items: T[],
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  for (let i = 0; i < items.length; i++) {
    await fn(items[i], i);
  }
}

/**
 * Execute an array of async operations in parallel
 * Usage: await map(items, async (item) => { return process(item); });
 */
export async function map<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  return Promise.all(items.map((item, index) => fn(item, index)));
}

/**
 * Execute an operation with retry logic
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 100
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
      }
    }
  }
  
  throw lastError || new Error('Max retry attempts exceeded');
}

/**
 * Execute with timeout
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage?: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(errorMessage || `Operation timed out after ${timeoutMs}ms`)),
        timeoutMs
      )
    )
  ]);
}

/**
 * Convert a callback-based function to a promise-based function
 * This wraps a function that takes callbacks and returns a function that returns promises
 * 
 * Usage: 
 *   const asyncFind = promisify(driver.find.bind(driver));
 *   const result = await asyncFind(table, conditions);
 */
export function promisify<T extends any[], R>(
  fn: (...args: [...T, (err: Error | null, result?: R) => void]) => void
): (...args: T) => Promise<R> {
  return function(this: unknown, ...args: T): Promise<R> {
    return new Promise((resolve, reject) => {
      fn.apply(
        this,
        [...args,
          (err: Error | null, result?: R) => {
            if (err) {
              reject(err);
            } else {
              resolve(result as R);
            }
          }
        ]
      );
    });
  };
}

/**
 * Convert a void callback-based function to a promise-based function
 * This wraps a function that takes callbacks and returns a function that returns promises
 * 
 * Usage: 
 *   const asyncRemove = promisifyVoid(driver.remove.bind(driver));
 *   await asyncRemove(table, conditions);
 */
export function promisifyVoid<T extends any[]>(
  fn: (...args: [...T, (err?: Error | null) => void]) => void
): (...args: T) => Promise<void> {
  return function(this: unknown, ...args: T): Promise<void> {
    return new Promise((resolve, reject) => {
      fn.apply(
        this,
        [...args,
          (err?: Error | null) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          }
        ]
      );
    });
  };
}

export default {
  callbackToPromise,
  callbackToPromiseVoid,
  eachSeries,
  map,
  retry,
  withTimeout,
  promisify,
  promisifyVoid
};
