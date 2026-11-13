# @productcraft/notify-react

React components and hooks for [ProductCraft Notify](https://productcraft.co/docs/notify): a drop-in notification inbox and preference centre. It is a thin binding over [`@productcraft/notify-js`](https://github.com/clauderanelagh/productcraft-node/tree/main/packages/notify-js#readme), which holds all the state (token refresh, the real-time stream, the inbox cache, optimistic marks, preferences); this package renders it.

```sh
npm install @productcraft/notify-react
```

Peers: `react` and `react-dom` 18 or later. Works in Vite, Next.js (App and Pages Router) and Remix. Preview: Notify is free while it is in preview.

## Usage

Your backend mints a short-lived recipient token for the signed-in user (with `@productcraft/notify` and your workspace API key, never in the browser):

```ts
// app/api/notify-token/route.ts (Next.js App Router)
import { Notify } from "@productcraft/notify";

const notify = new Notify(); // PRODUCTCRAFT_API_KEY and PRODUCTCRAFT_WORKSPACE_ID from the environment

export async function GET() {
  const userId = "user_123"; // your signed-in user's id, from your session
  const { token } = await notify.recipientTokens.mint({ recipient: userId, ttl_seconds: 3600 });
  return new Response(token, { headers: { "cache-control": "no-store" } });
}
```

The page wraps the components in a provider that fetches that token whenever it needs one. The token stays in memory: never in `localStorage`, cookies or URLs.

```tsx
"use client";
import { NotifyInbox, NotifyPreferences, NotifyProvider } from "@productcraft/notify-react";
import "@productcraft/notify-react/styles.css"; // the optional default theme

export function Notifications({ userId }: { userId: string }) {
  return (
    <NotifyProvider key={userId} getToken={() => fetch("/api/notify-token").then((r) => r.text())} locale="pt-PT">
      <NotifyInbox tenant="org_42" onNew={(item) => console.log("new", item.title)} />
      <NotifyPreferences channels={["inbox", "email", "webpush"]} />
    </NotifyProvider>
  );
}
```

Remount the provider when the signed-in user changes (`key={userId}`); on unmount it closes its stream and drops the token. Every export is a client module (the build starts with `"use client"`), so a Server Component can render `<NotifyInbox />` directly inside a client `<NotifyProvider>`.

| Export | What it does |
|---|---|
| `<NotifyProvider>` | `getToken` (called at start and when the API says the token expired) or `client` (a `createNotifyClient(...)` you own); `locale`, `strings`, and any other `createNotifyClient` option (`baseUrl`, `fetch`, `realtime`, `document`). |
| `<NotifyInbox>` | A bell button with the unread count and a popover inbox: real-time list, mark read / unread / all, archive, up to two action buttons per item, avatars, load more. Opening it marks the shown items seen. Props: `tenant`, `category`, `onNew`, `onNavigate(url, item)` (your router's `push`; default a full page load), `limit`, `className`, `theme`. |
| `<NotifyPreferences>` | A table with a switch per category × channel (required ones locked, with the reason), "turn off all optional notifications", the time zone and quiet hours. Each switch saves just its own cell, at once, and rolls back with a message if the save fails. When the recipient set no quiet hours but the workspace has a default, it shows that window ("Quiet hours 22:00–08:00 (default)") with a button to change it, instead of an off switch. "Required notifications still arrive" only shows when a channel shown is required. Props: `channels`, `quietHours`, `unsubscribeAll`, `className`, `theme`. |
| `useInbox({ category, tenant, status, archived, limit, onNew })` | `items`, `counts` (`unread`, `unseen`: the recipient's totals), `status`, `hasMore`, `realtime`, and `markRead`, `markSeen`, `markUnread`, `markAllRead`, `archive`, `unarchive`, `interact(id, actionKey?)`, `loadMore`, `refresh`. Hooks with the same filters share one store. |
| `usePreferences()` | `preferences` (with the workspace's categories and their defaults), `status`, `error`, `update(cells, { timezone, quiet_hours, unsubscribed_all })`, `refresh`. |
| `useNotifyClient()` | The provider's notify-js client (devices, `registerWebPush`). |
| `notifyStrings(locale, overrides?)`, `NOTIFY_LOCALES` | The component strings. |
| `renderMarkdown(body)`, `safeUrl(url)` | The inbox body's Markdown subset as React elements, and the URL check the components use. |

### Build your own UI

The hooks give you the same state the components use:

```tsx
import { useInbox } from "@productcraft/notify-react";

export function Badge() {
  const { counts, items, markAllRead } = useInbox({ onNew: (item) => console.log(item.title) });
  return (
    <button type="button" onClick={() => void markAllRead()} aria-label={`${counts.unread} unread`}>
      {counts.unread} · {items[0]?.title ?? "nothing new"}
    </button>
  );
}
```

## Safety

- **Links.** Every `href` and image `src` (the item's `action_url`, action buttons, Markdown links, avatars) is checked again in the browser: only `https:`, or `http:` on `localhost`. Anything else (`javascript:`, `data:`, relative paths) is not rendered as a link. Notify already refuses such URLs when a template is saved and when it renders.
- **Markdown subset, no HTML.** Item bodies render paragraphs, line breaks, lists (`- item`, `* item` or `1. item`, one level), `**strong**`, `*emphasis*` or `_emphasis_`, `~~strikethrough~~`, `` `code` ``, `[links](https://…)` and `\` escapes as React elements. Raw HTML is shown as text, never parsed. Headings, nested lists and images are not part of the subset.
- **Tokens** live in memory only; the provider never sees your API key. A `getToken` that returns a workspace key (`pcft_…`) is refused.

## Accessibility

The bell is a button whose label carries the unread count ("Notifications, 3 unread"). The popover is a labelled dialog that takes focus, keeps Tab inside it, and closes on Escape (focus returns to the bell) or an outside press. Items are a list; unread items say so to screen readers, and new items are announced politely. The preference centre is a table of labelled switches; locked cells say why. Animations only run when the user has not asked for reduced motion.

## Localisation

Strings ship for `en`, `pt-PT`, `pt-BR`, `es`, `fr` and `de` (`pt` means `pt-PT`; other locales fall back to their language, then English). Relative times use `Intl.RelativeTimeFormat` in the same locale. Override any string with `strings`:

```tsx
import { NotifyInbox, NotifyProvider } from "@productcraft/notify-react";

export const Inbox = () => (
  <NotifyProvider getToken={() => fetch("/api/notify-token").then((r) => r.text())} locale="es" strings={{ empty: "¡Nada nuevo!" }}>
    <NotifyInbox />
  </NotifyProvider>
);
```

The default locale is `en`, not the browser's language, so the server render and the first client render match. Pass the user's locale from your app.

## Styling

The components are unstyled apart from their class hooks (`pcn-inbox`, `pcn-bell`, `pcn-badge`, `pcn-popover`, `pcn-item`, `pcn-item[data-read]`, `pcn-actions`, `pcn-prefs`, `pcn-matrix`, `pcn-switch`, `pcn-locked`, `pcn-quiet` and more). `import "@productcraft/notify-react/styles.css"` adds a small default theme built on CSS variables, light and dark. Which one, strongest first:

1. the `theme` prop (`"light"`, `"dark"` or `"auto"`) on `<NotifyInbox>` / `<NotifyPreferences>`, or on `<NotifyProvider>` for both;
2. your app's theme on an ancestor: the `.dark` / `.light` class that Tailwind and next-themes put on `<html>`, `data-theme="dark"` / `data-theme="light"`, or `.pcn-dark` / `.pcn-light`;
3. the OS setting (`prefers-color-scheme`).

So an app in light mode on a dark OS gets a light inbox as soon as it marks its theme (`class="light"` or `data-theme="light"`). If your app only adds `.dark` and never `.light`, pass its resolved theme instead: `<NotifyProvider theme={resolvedTheme === "dark" ? "dark" : "light"}>` (next-themes' `useTheme()`).

Override variables on `.pcn-inbox, .pcn-prefs` (loaded after this file); scope dark-only values as `.dark .pcn-inbox`:

```css
.pcn-inbox, .pcn-prefs {
  --pcn-accent: #7c3aed;
  --pcn-radius: 6px;
  --pcn-font: "Inter", sans-serif;
}
```

Variables: `--pcn-font`, `--pcn-bg`, `--pcn-fg`, `--pcn-muted`, `--pcn-border`, `--pcn-hover`, `--pcn-accent`, `--pcn-accent-fg`, `--pcn-unread`, `--pcn-badge-bg`, `--pcn-badge-fg`, `--pcn-danger`, `--pcn-radius`, `--pcn-shadow`, `--pcn-width`.

## What Notify does not do for you

You still bring your own Apple APNs key and Firebase credentials for mobile push (they belong to your developer accounts; Notify stores them encrypted and never shows them again). This package covers the web: the in-app inbox and the preference centre. Web push in the browser is `registerWebPush` from `@productcraft/notify-js`, called from a click handler.

## Size

`<NotifyInbox/>` about 6 KB gzip, `<NotifyPreferences/>` about 4.5 KB, the hooks alone under 2 KB, on top of `@productcraft/notify-js` (about 5.5 KB) and the generated client scope of `@productcraft/notify` (about 13 KB). Budgets: 12, 6 and 3 KB.

MIT licensed.
