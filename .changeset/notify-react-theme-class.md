---
"@productcraft/notify-react": minor
---

Follow the app's theme, not just the OS. The default stylesheet now honours a `.dark` / `.light` class (Tailwind, next-themes) or `data-theme` on an ancestor over `prefers-color-scheme`, and a new `theme` prop (`"auto" | "light" | "dark"`) on `<NotifyProvider>`, `<NotifyInbox>` and `<NotifyPreferences>` pins it. A light app on a dark OS no longer gets a dark popover. Theme rules have single-class specificity, so your `.pcn-inbox { --pcn-… }` overrides still win.

`<NotifyPreferences>` shows the workspace's default quiet hours as "Quiet hours 22:00–08:00 (default)" with a Change button instead of an off switch, and only says "Required notifications still arrive" when a shown channel is required.
