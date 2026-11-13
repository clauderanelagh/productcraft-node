/**
 * @productcraft/notify-react: React components and hooks for ProductCraft Notify, a thin binding over
 * `@productcraft/notify-js` (all state lives there). Hand-written (docs/sdk-standard.md section 6).
 * The whole module is a client module ("use client" on both builds) for the Next.js App Router.
 */
export { NotifyProvider, useInbox, useNotifyClient, usePreferences } from "./provider.js";
export type { NotifyInboxItem, NotifyPreferencesData, NotifyPreferencesExtra, NotifyProviderProps, NotifyTheme, UseInboxOptions, UseInboxResult, UsePreferencesResult } from "./provider.js";
export { NotifyInbox } from "./inbox.js";
export type { NotifyInboxProps } from "./inbox.js";
export { NotifyPreferences } from "./preferences.js";
export type { NotifyPreferencesProps } from "./preferences.js";
export { NOTIFY_LOCALES, notifyStrings } from "./strings.js";
export type { NotifyStrings } from "./strings.js";
export { renderMarkdown, safeUrl } from "./markdown.js";
