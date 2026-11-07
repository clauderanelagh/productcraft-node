/**
 * @productcraft/gen-fixture: the generator's test fixture. The shape every
 * generated product package follows: the class, its type namespace, the
 * error classes and the `paths` escape-hatch types all come from
 * `_generated/` (scripts/gen-sdk.mjs); this file only re-exports them.
 */
export { Fixture } from "./_generated/client.js";
export * from "./_generated/errors.js";
export type * from "./_generated/runtime.js";
export type { paths, components } from "./_generated/paths.js";
export { Fixture as default } from "./_generated/client.js";
