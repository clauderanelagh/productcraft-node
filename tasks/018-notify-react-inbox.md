# 018 — `@productcraft/notify-react`: inbox component, hooks, web push helper

| Field | Value |
|---|---|
| Title | React inbox package and the SDK-standard amendment for a hand-written browser package |
| Status | pending |
| Priority | high (Notify program, step 19 of 27) |
| Dependencies | 017 published |
| Summary | A separate, allowlisted React package: `<NotifyProvider>`, `<NotifyInbox/>` (bell + badge + popover), headless `useInbox`/`usePreferences`, an SSE fetch-stream client with polling fallback, and `registerWebPush` + the service-worker snippet. |

## Context

- `monorepo/internal_docs/notify/design.md` sections 8 (stream protocol: events, heartbeat, `Last-Event-ID`, `auth_expired`, caps), 11.2 (API, accessibility, size budget), 7.2 (web push payload), PRD P11.
- `docs/sdk-standard.md` sections 6 (hand-written allowlist) and 12 (deferred browser entries); `packages/auth-passport` as the precedent for a hand-written adapter package.

## Requirements

- Standard amendment in the same PR (Flags 014 amends section 6 for local-evaluation code first: rebase onto it and add a row, never rewrite its text): section 6 row (`packages/notify-react/src/**`: UI and browser streaming are not HTTP operations), section 12 note (first browser package; Node packages stay React-free), decision-log entry; `scripts/handwritten-allowlist.json` entry with the reason.
- Package: peer `react >= 18` and `react-dom`, depends on `@productcraft/notify` (client scope types and calls), ESM + CJS, `"sideEffects": ["*.css"]`, no other runtime deps.
- `getToken` refresh on 401 `RECIPIENT_TOKEN_EXPIRED` and `auth_expired`, deduped; stream reader with backoff 1 s → 30 s, `Last-Event-ID`, polling `GET /client/inbox/counts` (ETag, ≥ 30 s) after 3 failures, paused while the tab is hidden; never puts the token in a URL.
- `<NotifyInbox/>`: accessible (button with count in `aria-label`, focus-trapped popover, Escape, list semantics, read state announced, `prefers-reduced-motion`), Markdown subset rendered without raw HTML, CSS variables with light/dark defaults, class hooks for full restyling.
- `registerWebPush({ serviceWorkerPath })` (reads the VAPID public key via the client scope, subscribes, registers the device) and the `notify-sw.js` snippet (show, `notificationclick` → open `url`, `pushsubscriptionchange` → re-register), exported as a file and a string.
- Size budget: `<NotifyInbox/>` ≤ 12 KB gzip, hooks-only entry ≤ 5 KB.
- Trusted publisher for `@productcraft/notify-react` before the Version Packages merge.

## Testing

Vitest + Testing Library: hook state transitions on stream events, token refresh dedupe, reconnect with `Last-Event-ID`, polling fallback, hidden-tab pause; axe on the component; a Playwright test (headless, CI) against core's mock server serving an SSE stream; service-worker unit tests with a fake `self`.

## Definition of Done

- [ ] CI green; merged; Version Packages merged on green; package on npm (checked); a throwaway local page using the published package shows a live inbox against testing-environment (headless Chromium, closed afterwards; resources deleted).
- [ ] This file deleted in the PR.
