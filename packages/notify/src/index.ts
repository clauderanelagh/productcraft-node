/**
 * @productcraft/notify: notifications across an in-app inbox, email, web push, APNs and FCM.
 * Every resource method, type, error class and mock is generated from the Notify OpenAPI
 * document (scripts/gen-sdk.mjs), including the recipient-token scope `notify.client({ token })`;
 * this file only re-exports them.
 */
export { Notify } from "./_generated/client.js";
export * from "./_generated/errors.js";
export type * from "./_generated/runtime.js";
export type { paths, components } from "./_generated/paths.js";
export { Notify as default } from "./_generated/client.js";
