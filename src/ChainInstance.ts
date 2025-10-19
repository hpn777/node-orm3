/**
 * Chain Instance - Chain operations on query results
 */

export interface ChainInstanceCalls {
  filter(cb: (item: any) => boolean): ChainInstanceCalls;
  forEach(cb: (item: any) => void): ChainInstanceCalls;
  sort(sortFn: (a: any, b: any) => number): ChainInstanceCalls;
  count(cb: (count: number) => void): ChainInstanceCalls;
  get(cb: (instances: any[]) => void): ChainInstanceCalls;
  save(cb?: (err?: Error) => void): ChainInstanceCalls;
}

interface QueueItem {
  hwd: Function;
  args: IArguments | any[];
}

function ChainInstance(chain: any, cb?: Function): ChainInstanceCalls {
  let instances: any[] | null = null;
  let loading = false;
  const queue: QueueItem[] = [];

  const load = (): void => {
    loading = true;
    chain.run((err: Error | null, items?: any[]) => {
      instances = items || [];
      return next();
    });
  };

  const promise = (hwd: Function, next: Function): Function => {
    return function (): ChainInstanceCalls {
      if (!loading) {
        load();
      }

      queue.push({ hwd: hwd, args: arguments });

      return calls;
    };
  };

  const next = (): void => {
    if (queue.length === 0) return;

    const item = queue.shift();
    if (item) {
      item.hwd.apply(calls, item.args);
    }
  };

  const calls: any = {
    filter: promise(function (cb: (item: any) => boolean) {
      if (instances) {
        instances = instances.filter(cb);
      }
      return next();
    }, next),

    forEach: promise(function (cb: (item: any) => void) {
      if (instances) {
        instances.forEach(cb);
      }
      return next();
    }, next),

    sort: promise(function (sortFn: (a: any, b: any) => number) {
      if (instances) {
        instances.sort(sortFn);
      }
      return next();
    }, next),

    count: promise(function (cb: (count: number) => void) {
      if (instances) {
        cb(instances.length);
      }
      return next();
    }, next),

    get: promise(function (cb: (instances: any[]) => void) {
      if (instances) {
        cb(instances);
      }
      return next();
    }, next),

    save: promise(function (cb?: (err?: Error) => void) {
      if (!instances) return next();

      const saveNext = (i: number): void => {
        if (i >= instances!.length) {
          if (typeof cb === "function") {
            cb();
          }
          return next();
        }

        return instances![i].save((err?: Error) => {
          if (err) {
            if (typeof cb === "function") {
              cb(err);
            }
            return next();
          }

          return saveNext(i + 1);
        });
      };

      return saveNext(0);
    }, next)
  };

  if (typeof cb === "function") {
    return calls.forEach(cb);
  }
  return calls;
}

export default ChainInstance;
