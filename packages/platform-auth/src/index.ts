/**
 * @productcraft/platform-auth: workspaces, members, invites, roles and IAM
 * policies, API keys, service activation and introspection. Every resource
 * method, type, error class and mock is generated from the Platform OpenAPI
 * document (scripts/gen-sdk.mjs); this file only re-exports them.
 */
export { PlatformAuth } from "./_generated/client.js";
export * from "./_generated/errors.js";
export type * from "./_generated/runtime.js";
export type { paths, components } from "./_generated/paths.js";
export { PlatformAuth as default } from "./_generated/client.js";
