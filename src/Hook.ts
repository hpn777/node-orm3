/**
 * Hook utility functions
 */

export function trigger(self: any, cb: Function | undefined, ...args: any[]): void {
  if (typeof cb === "function") {
    cb.apply(self, args);
  }
}

export function wait(
  self: any,
  hook: Function | undefined,
  next: (err?: Error) => void,
  opts?: any
): void | Promise<void> {
  if (typeof hook !== "function") {
    return next();
  }

  const hookDoesntExpectCallback = opts ? hook.length < 2 : hook.length < 1;
  
  let hookValue: any;
  if (hookDoesntExpectCallback) {
    // Hook doesn't expect a callback, call it without next parameter
    if (opts) {
      hookValue = hook.call(self, opts);
    } else {
      hookValue = hook.call(self);
    }
  } else {
    // Hook expects a callback, pass next as callback
    if (opts) {
      hookValue = hook.call(self, opts, next);
    } else {
      hookValue = hook.call(self, next);
    }
  }

  const isPromise = hookValue && typeof hookValue.then === "function";

  if (hookDoesntExpectCallback) {
    if (isPromise) {
      return hookValue
        .then(() => next())
        .catch(next);
    }
    return next();
  }
}

export default { trigger, wait };
