---
"@productcraft/notify-react": minor
---

New package: `@productcraft/notify-react`, React components and hooks for ProductCraft Notify. `<NotifyProvider getToken>` holds one browser client; `<NotifyInbox/>` is a bell with the unread count and an accessible popover inbox (real-time updates, mark read / unread / all, archive, up to two action buttons, `tenant` and `category` filters, `onNew`, `onNavigate`); `<NotifyPreferences/>` is a preference centre (a switch per category × channel with required ones locked, turn off all optional notifications, time zone and quiet hours), saving one cell at a time. Hooks `useInbox({ category, tenant, onNew })` and `usePreferences()`. Strings in en, pt-PT, pt-BR, es, fr and de with overrides, relative times via `Intl.RelativeTimeFormat`, every URL re-checked (`https:` only) and a Markdown subset without raw HTML, an optional CSS-variable theme (`@productcraft/notify-react/styles.css`, light and dark), and `"use client"` for the Next.js App Router.
