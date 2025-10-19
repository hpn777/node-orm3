/**
 * Singleton instance cache
 */

interface CacheEntry {
  o: any;
  t: number | null;
}

interface SingletonOptions {
  identityCache?: boolean | number;
  saveCheck?: boolean;
}

let map: Record<string, CacheEntry> = {};

export function clear(key?: string): void {
  if (typeof key === "string") {
    delete map[key];
  } else {
    map = {};
  }
}

export function get(
  key: string,
  opts: SingletonOptions,
  createCb: (cb: (err: Error | null, value?: any) => void) => void,
  returnCb: (err: Error | null, value?: any) => void
): void {
  if (opts && opts.identityCache === false) {
    return createCb(returnCb);
  }

  if (Object.prototype.hasOwnProperty.call(map, key)) {
    if (opts && opts.saveCheck && typeof map[key].o.saved === "function" && !map[key].o.saved()) {
      return createCb(returnCb);
    } else if (map[key].t !== null && map[key].t <= Date.now()) {
      delete map[key];
    } else {
      return returnCb(null, map[key].o);
    }
  }

  createCb((err: Error | null, value?: any) => {
    if (err) return returnCb(err);

    map[key] = {
      o: value,
      t: (opts && typeof opts.identityCache === "number" ? Date.now() + (opts.identityCache * 1000) : null)
    };
    return returnCb(null, map[key].o);
  });
}

export default { clear, get };
