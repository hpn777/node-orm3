/**
 * Chain Instance - Promise-based cursor over query results
 */

export interface ChainInstanceCalls<T = any> {
  filter(cb: (item: T, index: number, items: T[]) => boolean | Promise<boolean>): ChainInstanceCalls<T>;
  forEach(cb: (item: T, index: number, items: T[]) => void | Promise<void>): ChainInstanceCalls<T>;
  sort(sortFn: (a: T, b: T) => number): ChainInstanceCalls<T>;
  count(): Promise<number>;
  get(): Promise<T[]>;
  save(): Promise<void>;
}

type Operation<T> = (items: T[]) => T[] | Promise<T[]>;

class ChainCursor<T = any> implements ChainInstanceCalls<T> {
  private operations: Array<Operation<T>> = [];
  private cache: T[] | null = null;

  constructor(private readonly loader: () => Promise<T[]>) {}

  private enqueue(operation: Operation<T>): this {
    this.operations.push(operation);
    this.cache = null; // invalidate cache when new operation is added
    return this;
  }

  private async loadProcessed(): Promise<T[]> {
    if (!this.cache) {
      const baseItems = await this.loader();
      let result = baseItems.slice();

      for (const operation of this.operations) {
        result = await operation(result);
      }

      this.cache = result;
    }

    return this.cache;
  }

  filter(cb: (item: T, index: number, items: T[]) => boolean | Promise<boolean>): this {
    return this.enqueue(async (items) => {
      const filtered: T[] = [];
      for (let i = 0; i < items.length; i++) {
        if (await cb(items[i], i, items)) {
          filtered.push(items[i]);
        }
      }
      return filtered;
    });
  }

  forEach(cb: (item: T, index: number, items: T[]) => void | Promise<void>): this {
    return this.enqueue(async (items) => {
      for (let i = 0; i < items.length; i++) {
        await cb(items[i], i, items);
      }
      return items;
    });
  }

  sort(sortFn: (a: T, b: T) => number): this {
    return this.enqueue((items) => {
      return items.slice().sort(sortFn);
    });
  }

  async count(): Promise<number> {
    const items = await this.loadProcessed();
    return items.length;
  }

  async get(): Promise<T[]> {
    return this.loadProcessed();
  }

  async save(): Promise<void> {
    const items = await this.loadProcessed();
    for (const item of items) {
      const candidate: any = item as any;
      if (typeof candidate?.save !== 'function') {
        throw new Error('ChainInstance.save() expects items with an async save() method.');
      }
      if (candidate.save.length > 0) {
        await new Promise<void>((resolve, reject) => {
          candidate.save((err?: Error | null) => {
            if (err) {
              return reject(err);
            }
            resolve();
          });
        });
      } else {
        const result = candidate.save();
        if (result && typeof result.then === 'function') {
          await result;
        }
      }
    }
  }
}

function ChainInstance<T = any>(
  loader: () => Promise<T[]>,
  initialIterator?: (item: T, index: number, items: T[]) => void | Promise<void>
): ChainInstanceCalls<T> {
  const cursor = new ChainCursor<T>(loader);
  if (typeof initialIterator === 'function') {
    cursor.forEach(initialIterator);
  }
  return cursor;
}

export default ChainInstance;
