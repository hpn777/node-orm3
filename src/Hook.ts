/**
 * Hook utility functions - Promise-based
 * 
 * All hooks are now promise-based for consistency with async/await patterns.
 * Hooks should return a Promise<void> that resolves when the hook is complete.
 */

/**
 * Emit a hook event (for backward compatibility)
 * @deprecated Use await hook() directly instead
 */
export function trigger(self: any, cb: Function | undefined, ...args: any[]): void {
  if (typeof cb === "function") {
    cb.apply(self, args);
  }
}

/**
 * Wait for a hook to complete
 * Hooks should be async functions that return Promise<void>
 * 
 * @param self - The context to execute the hook in
 * @param hook - The hook function to execute
 * @param options - Optional arguments to pass to the hook
 * @returns A promise that resolves when the hook completes
 */
export async function wait(
  self: any,
  hook: Function | undefined,
  optionsOrCallback?: any,
  maybeCallback?: (err?: Error) => void
): Promise<void> {
  let options = optionsOrCallback;
  let callback = maybeCallback;

  // Backwards compatibility: if only three args and third is a function,
  // treat it as the callback (Node-style signature).
  if (typeof optionsOrCallback === "function" && maybeCallback === undefined) {
    callback = optionsOrCallback as (err?: Error) => void;
    options = undefined;
  }

  if (typeof hook !== "function") {
    if (callback) {
      callback();
    }
    return;
  }

  try {
    const result = options !== undefined
      ? hook.call(self, options)
      : hook.call(self);

    if (result && typeof result.then === "function") {
      await result;
    }

    if (callback) {
      callback();
    }
  } catch (error) {
    if (callback) {
      callback(error as Error);
      return;
    }
    throw error;
  }
}

export default { trigger, wait };
