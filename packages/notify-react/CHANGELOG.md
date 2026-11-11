# @productcraft/notify-react

## 0.1.1

### Patch Changes

- dc60f64: `<NotifyInbox/>`: the popover now stays inside the viewport. It used to hang from the bell's right edge at a fixed width, so a bell on the left of the layout (a sidebar, a left-aligned header) opened it off-screen, with "Mark all as read" and most items out of reach. It now shifts sideways to keep a 16 px gutter, on open and on resize.

## 0.1.0

### Minor Changes

- 3368b2e: New package: `@productcraft/notify-react`, React components and hooks for ProductCraft Notify. `<NotifyProvider getToken>` holds one browser client; `<NotifyInbox/>` is a bell with the unread count and an accessible popover inbox (real-time updates, mark read / unread / all, archive, up to two action buttons, `tenant` and `category` filters, `onNew`, `onNavigate`); `<NotifyPreferences/>` is a preference centre (a switch per category × channel with required ones locked, turn off all optional notifications, time zone and quiet hours), saving one cell at a time. Hooks `useInbox({ category, tenant, onNew })` and `usePreferences()`. Strings in en, pt-PT, pt-BR, es, fr and de with overrides, relative times via `Intl.RelativeTimeFormat`, every URL re-checked (`https:` only) and a Markdown subset without raw HTML, an optional CSS-variable theme (`@productcraft/notify-react/styles.css`, light and dark), and `"use client"` for the Next.js App Router.

### Patch Changes

- Updated dependencies [3368b2e]
  - @productcraft/notify-js@0.2.0
