/**
 * Debug utilities
 */

let enabled = false;

export function enabled_set(value: boolean): void {
  enabled = value;
}

export function enabled_get(): boolean {
  return enabled;
}

export function debug(...args: any[]): void {
  if (enabled) {
    console.log.apply(console, args);
  }
}

export function sql(...args: any[]): void {
  debug(...args);
}

export default { enabled_set, enabled_get, debug, sql };
