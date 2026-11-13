# @productcraft/notify-react

## 0.3.0

### Minor Changes

- 810d5ac: Follow the app's theme, not just the OS. The default stylesheet now honours a `.dark` / `.light` class (Tailwind, next-themes) or `data-theme` on an ancestor over `prefers-color-scheme`, and a new `theme` prop (`"auto" | "light" | "dark"`) on `<NotifyProvider>`, `<NotifyInbox>` and `<NotifyPreferences>` pins it. A light app on a dark OS no longer gets a dark popover. Theme rules have single-class specificity, so your `.pcn-inbox { --pcn-… }` overrides still win.

  `<NotifyPreferences>` shows the workspace's default quiet hours as "Quiet hours 22:00–08:00 (default)" with a Change button instead of an off switch, and only says "Required notifications still arrive" when a shown channel is required.

### Patch Changes

- @productcraft/notify-js@0.2.3

## 0.2.0

### Minor Changes

- bc79346: `<NotifyInbox/>` and `renderMarkdown` now render lists in item bodies (`- item`, `* item`, `+ item` and `1. item`, one level). Data that Notify escapes into a template still can't start a list.

  Accessibility fixes in the default theme: the timestamp on unread items now passes 4.5:1 contrast (`--pcn-muted` is `#636369` in light mode), and the mark-as-read and archive buttons are 32 px, or 44 px on touch screens. `<NotifyPreferences/>` now says "Couldn't load your notification settings." when loading fails, instead of the inbox's message. The new `preferencesLoadError` string ships in every locale and can be overridden with `strings`.

## 0.1.1

### Patch Changes

- dc60f64: `<NotifyInbox/>`: the popover now stays inside the viewport. It used to hang from the bell's right edge at a fixed width, so a bell on the left of the layout (a sidebar, a left-aligned header) opened it off-screen, with "Mark all as read" and most items out of reach. It now shifts sideways to keep a 16 px gutter, on open and on resize.

## 0.1.0

### Minor Changes

- 3368b2e: New package: `@productcraft/notify-react`, React components and hooks for ProductCraft Notify. `<NotifyProvider getToken>` holds one browser client; `<NotifyInbox/>` is a bell with the unread count and an accessible popover inbox (real-time updates, mark read / unread / all, archive, up to two action buttons, `tenant` and `category` filters, `onNew`, `onNavigate`); `<NotifyPreferences/>` is a preference centre (a switch per category × channel with required ones locked, turn off all optional notifications, time zone and quiet hours), saving one cell at a time. Hooks `useInbox({ category, tenant, onNew })` and `usePreferences()`. Strings in en, pt-PT, pt-BR, es, fr and de with overrides, relative times via `Intl.RelativeTimeFormat`, every URL re-checked (`https:` only) and a Markdown subset without raw HTML, an optional CSS-variable theme (`@productcraft/notify-react/styles.css`, light and dark), and `"use client"` for the Next.js App Router.

### Patch Changes

- Updated dependencies [3368b2e]
  - @productcraft/notify-js@0.2.0
