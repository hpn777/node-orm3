/**
 * Compatibility re-export that preserves the historical shim path while the
 * validation logic now lives in the vendored TypeScript implementation.
 *
 * @deprecated Use `src/vendor/enforce` directly instead.
 */
export { default } from '../vendor/enforce';
export * from '../vendor/enforce';
