# 018 — `@productcraft/notify-js`: framework-agnostic browser client core

| Field | Value |
|---|---|
| Title | Hand-written browser core for Notify (tokens, stream, cache, counts, web push) and the SDK-standard amendment |
| Status | pending |
| Priority | high (Notify program, step 20 of 29) |
| Dependencies | 017 published |
| Summary | A separate, allowlisted, framework-free package that owns every stateful client concern so React, Vue, Svelte, vanilla JS and React Native share one implementation: `createNotifyClient({ getToken })` with an inbox store, `onNew`, mark/interact, per-cell preference updates, device unregister, `registerWebPush` and the `notify-sw.js` service-worker snippet. `@productcraft/notify-react` (020) is a thin wrapper over it. |

## Context

- `monorepo/internal_docs/notify/design.md` sections 4 (client routes, token rules), 8 (stream protocol: events, heartbeat, `Last-Event-ID`, `auth_expired`, jittered `retry`), 11.2 (this package), 7.2 (web push payload); PRD P11; `review-decisions.md` C9, C10f, C11, S9.
- `docs/sdk-standard.md` sections 6 (hand-written allowlist) and 12 (deferred browser entries); `packages/auth-passport` as the precedent for a hand-written package.

## Requirements

- Standard amendment in this PR (Flags 014 amends section 6 for local-evaluation code first: rebase onto it and add a row, never rewrite its text): section 6 row (`packages/notify-js/src/**`: browser streaming and client state are not HTTP operations), section 12 note (first browser package; Node packages stay framework-free), decision-log entry; `scripts/handwritten-allowlist.json` entry with the reason.
- Package: depends only on `@productcraft/notify` (client scope types and calls); ESM + CJS; `"sideEffects": false`; no framework dependency.
- Token manager: `getToken` at start and on `401 RECIPIENT_TOKEN_EXPIRED`/`auth_expired`, deduped; tokens held in memory only (never `localStorage`/`sessionStorage`, never in a URL) (S9).
- Stream reader: fetch-stream SSE with `Authorization: Bearer`, backoff 1 s → 30 s with jitter, honours server `retry`, `Last-Event-ID`, polling `GET /client/inbox/counts` (ETag, ≥ 30 s) after 3 consecutive failures, paused while the document is hidden; documented React Native use with a fetch-streaming polyfill.
- Inbox store: `subscribe(listener)`, `items`, `counts`, `status`, `loadMore`, `markRead/markSeen/markAllRead/archive/unarchive`, `interact(id, actionKey?)`, `onNew(cb)` (for toasts), `tenant` and `category` filters; optimistic updates reconciled with server counts; retracted items removed on `item.updated`.
- Preferences: `get()`, `update(cells[], { timezone?, quiet_hours? })` over the per-cell `PATCH` (C7).
- Devices: `devices.unregister(id)` for logout (C10f).
- `registerWebPush(client, { serviceWorkerPath })`: must be called from a user gesture (documented, throws a typed error otherwise where detectable), reads the VAPID public key, subscribes, registers the device; `notify-sw.js` snippet (show, `notificationclick` → open `url` / call interact for action buttons, `pushsubscriptionchange` → re-register), exported as a file and a string.
- Size budget ≤ 6 KB gzip. Trusted publisher for `@productcraft/notify-js` before the Version Packages merge.

## Testing

Vitest: store transitions on stream events, token refresh dedupe, reconnect with `Last-Event-ID`, jittered `retry`, polling fallback, hidden-tab pause, optimistic mark reconciliation, retract handling, no token ever written to storage (spy on `Storage.prototype`); service-worker unit tests with a fake `self`; a Playwright test (headless, CI) against core's mock server serving an SSE stream; size budget; dist smoke ESM + CJS.

## Definition of Done

- [ ] CI green; merged; Version Packages merged on green; package on npm (checked); a throwaway vanilla-JS page using the published package shows a live inbox against testing-environment (headless Chromium, closed afterwards; resources deleted).
- [ ] This file deleted in the PR.
