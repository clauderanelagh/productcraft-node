# 019 — Flags in the browser: `@productcraft/flags` browser entry and `@productcraft/flags-react`

| Field | Value |
|---|---|
| Title | Browser / React Native entry for `FlagsClient` and the React bindings |
| Status | pending |
| Priority | high (Flags program, step 17 of 26) |
| Dependencies | 015 published |
| Summary | Most teams on ConfigCat gate UI in a SPA, Next.js or React Native app. Ship a browser entry of `@productcraft/flags` and `@productcraft/flags-react` (`FlagsProvider`, `useFlag`, SSR bootstrap from `snapshot()`), so a Flags customer does not need a second vendor for the frontend (PRD P19, story 19). |

## Context

- Design 8.1 (package rows for the browser entry and flags-react), 8.2 (`FlagsClient`, `snapshot()`, `bootstrap`), 6.3 (CORS on the delivery path; browsers rely on the HTTP cache and must not set `If-None-Match` by hand), 13 (exposure: a key in a browser makes its config public), section 18 row C4.
- Standard: `docs/sdk-standard.md` section 6 (the local-evaluation row added in 014 covers `packages/flags-react/**` too: extend it; Notify's task 018 adds an amendment for hand-written browser packages, so reuse whichever lands first instead of writing a second one), `check-types-resolution`, size budget, the existing browser guard in core (the management client keeps refusing to run in a browser; `FlagsClient` does not use `APIClient`).

## Requirements

- `@productcraft/flags` `exports`: a `browser` and a `react-native` condition pointing at a build without the Node-only module (file overrides, `process.env`); same API otherwise. No `If-None-Match` header in browsers (the HTTP cache handles revalidation); `fetch` and timers only; `visibilitychange` pauses auto polling while the tab is hidden and refreshes on return.
- New public package `packages/flags-react` (0.1.0), peer deps `react` ≥ 18 and `@productcraft/flags` (`^0.1 || ^1`), ESM + CJS, `"use client"` on the hooks module: `FlagsProvider` (`client` or `FlagsClientOptions`, optional `bootstrap`, optional `user`), `useFlag(key, default, user?)`, `useFlagDetails`, `useFlagsClient`, `useFlagsReady`. Re-renders on `configChanged` via `useSyncExternalStore`.
- SSR / Next.js: on the server, `FlagsClient.snapshot()` evaluates for the request; `snapshot.toJSON()` passed as `bootstrap` to `FlagsProvider` gives the first client render the same values (no flash, no hydration mismatch). An App Router example and a Pages Router note in the README.
- Docs copy (README and the package description): a key used in a browser or mobile app makes its whole config public, so client flags belong in their own config with no internal rules.
- Size budget entries: browser `new FlagsClient({sdkKey}).getValue('k', false)` ≤ 10 KB gzip; `flags-react` hooks ≤ 2 KB gzip on top.
- Allowlist entries with reasons; root README and `CLAUDE.md` package tables; trusted publisher for `@productcraft/flags-react` configured before the Version Packages merge.

## Out of Scope

Server-only vs client key types (v1.1); Vue/Svelte bindings; React Native storage adapters beyond the pluggable cache interface.

## Testing

Vitest with jsdom: the engine vectors through the browser build (bootstrap mode); hooks re-render on a config change; SSR render → hydrate with the same bootstrap shows no mismatch (react-dom/server + hydrateRoot); `visibilitychange` pausing; no `node:` imports in the browser bundle (bundle check); dist smoke ESM + CJS; `check-types-resolution`; size budgets.

## Definition of Done

- [ ] CI green; merged; Version Packages merged on green; `@productcraft/flags-react` and the new `@productcraft/flags` version on npm.
- [ ] A Vite + React example in `examples/` reads a flag from a throwaway testing-environment project in a headless browser (key read inside the script, never as a tool argument) and the project is deleted.
- [ ] This file deleted in the PR.
