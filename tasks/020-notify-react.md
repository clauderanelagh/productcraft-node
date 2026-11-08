# 020 — `@productcraft/notify-react`: `<NotifyInbox/>`, `<NotifyPreferences/>` and hooks

| Field | Value |
|---|---|
| Title | Thin React wrapper over `@productcraft/notify-js` with a drop-in inbox and preference centre |
| Status | pending |
| Priority | high (Notify program, step 21 of 29) |
| Dependencies | 018 published |
| Summary | `<NotifyProvider>`, `<NotifyInbox/>` (bell, badge, popover, action buttons, tenant filter), `<NotifyPreferences/>` (category × channel matrix with mandatory cells locked, timezone and quiet hours), hooks `useInbox({ onNew })` / `usePreferences()`, localised strings, a "use client" entry for the Next.js App Router. |

## Context

- `monorepo/internal_docs/notify/design.md` section 11.3; PRD P11; `review-decisions.md` C7, C9, C11, S12.
- The sdk-standard section 6 row from 018 covers `packages/notify-react/src/**` too (add the path to that row; do not add a second amendment).

## Requirements

- Peer `react >= 18` and `react-dom`; depends on `@productcraft/notify-js`; ESM + CJS; `"sideEffects": ["*.css"]`; no other runtime deps. All state lives in the core; this package only binds it (`useSyncExternalStore`).
- `<NotifyInbox tenant? category? />`: accessible (button with count in `aria-label`, focus-trapped popover, Escape, list semantics, read state announced, `prefers-reduced-motion`); Markdown subset without raw HTML; up to two action buttons per item calling `interact`; actor avatar and name; every `href` re-checked (`https:`, or `http:` on localhost) before rendering (S12).
- `<NotifyPreferences/>`: a table of labelled switches per category × channel, mandatory cells locked with an explanation, timezone picker (IANA) and quiet-hours window; per-cell updates through the core (no full replace).
- Hooks: `useInbox({ category, tenant, onNew })`, `usePreferences()`.
- Localised component strings (en, pt-PT, pt-BR, es, fr, de; override map) and relative times via `Intl.RelativeTimeFormat`.
- CSS variables with light/dark defaults and class hooks for full restyling.
- Size budget: `<NotifyInbox/>` ≤ 12 KB gzip, `<NotifyPreferences/>` ≤ 6 KB, hooks-only entry ≤ 3 KB on top of the core.
- Trusted publisher for `@productcraft/notify-react` before the Version Packages merge.

## Testing

Vitest + Testing Library: hook state from core events, `onNew`, preference cell update and mandatory lock, locale switch; axe on both components; unsafe `javascript:` links not rendered; a Playwright test (headless, CI) against core's mock server; Next.js App Router build fixture proves the "use client" entry.

## Definition of Done

- [ ] CI green; merged; Version Packages merged on green; package on npm (checked); a throwaway local Next.js page using the published package shows a live inbox and a working preference centre against testing-environment (headless Chromium, closed afterwards; resources deleted).
- [ ] This file deleted in the PR.
