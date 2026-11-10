/**
 * @productcraft/notify-js: the framework-agnostic browser (and React Native) core of ProductCraft Notify.
 * Hand-written (docs/sdk-standard.md section 6): client state and streaming are not HTTP operations. The
 * calls themselves go through the generated recipient-token scope of `@productcraft/notify`.
 */
export { createNotifyClient, SW_MESSAGE } from "./client.js";
export type { NotifyBrowserClient, NotifyClientOptions, NotifyClientScope } from "./client.js";
export { InboxStore } from "./inbox.js";
export type { InboxFilters, InboxState } from "./inbox.js";
export type { RealtimeStatus, VisibilitySource } from "./realtime.js";
export { PreferencesStore, resolvePreference } from "./preferences.js";
export type { PreferenceCellPatch, PreferenceChannel, PreferencesState, ResolvedCell } from "./preferences.js";
export { registerWebPush } from "./webpush.js";
export type { RegisterWebPushOptions, WebPushRegistration } from "./webpush.js";
export { NotifyClientError } from "./errors.js";
export type { NotifyClientErrorCode } from "./errors.js";
