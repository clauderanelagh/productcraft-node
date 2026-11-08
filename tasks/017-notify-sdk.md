# 017 — `@productcraft/notify`: generated SDK for Notify

| Field | Value |
|---|---|
| Title | Notify SDK on the generator, with the bound recipient-token client scope |
| Status | pending |
| Priority | high (Notify program, step 18 of 27) |
| Dependencies | monorepo `tasks/notify-api/012` deployed (full spec incl. `/v1/client/*` live at `api.notify.productcraft.co`); Flags 015 merged if it lands first (shared umbrella, `PC_BASE_URL`, size budget, workflow lists: rebase, never revert) |
| Summary | Add Notify as a generated surface: management resources, the browser-safe `notify.client({ token })` scope, typed webhooks, mocks, live smoke, umbrella entry, first release. |

## Context

- `monorepo/internal_docs/notify/design.md` sections 3.2 (resources and SDK names), 4 (client scope), 10 (webhook catalogue), 11.1.
- Checklist section M (`monorepo` `work/notify-2026-11/platform-integration-checklist.md`): `packages/gen-fixture/` template, `SURFACES`, `refresh-specs.sh`, `codegen.sh`, `PC_BASE_URL.notify`, umbrella, size budget, live smoke, workflow lists, README/CLAUDE tables, api-report, changeset, trusted publisher.
- No hand-written code is needed (design T5: token minting is an API call). If the bound client scope needs a generator feature (a bearer-token scope rather than a path bind), add it to the generator with a gen-fixture case, not per-package code.

## Requirements

- `packages/notify` public (`0.0.0` → minor `0.1.0`), `SURFACES.notify` (`className: 'Notify'`, `baseUrlKey: 'notify'`, `docsUrl: https://productcraft.co/docs/notify`, `webhookSecretEnv: PRODUCTCRAFT_NOTIFY_WEBHOOK_SECRET`), `Specs/notify.json` via `refresh-specs.sh` only, `./testing` export, generated README region, examples, `api.md`.
- `notify.client({ token })`: sends `Authorization: Bearer <recipient token>`, never a PAK; `public`-style browser-safe (no secret-key guard trips in a browser bundle); covered by a gen-fixture case.
- Idempotency-Key auto-sent on `notifications.send` (required there) and every op that declares it.
- `PC_BASE_URL.notify` in `packages/core/src/legacy.ts`; umbrella `pc.notify` + tests; `scripts/size-budget.json` entry (`new Notify({apiKey}).notifications.send(...)` and `notify.client({token}).inbox.list()`); `spec-refresh.yml` host list; `release.yml` comment list; README and CLAUDE.md tables.
- `scripts/live/notify.mjs`: testing-environment only; sweep stale `sdk-smoke-` resources first; create a throwaway category + type (inbox + email to a throwaway Mail template), upsert recipient `sdk-smoke-<ts>` with `success@simulator.amazonses.com`, send, poll the delivery to `sent`/`delivered`, mint a token, read the inbox through `client()`, mark read, erase the recipient and delete the type in `finally`. ≤ 5 req/s.
- npm trusted publisher for `@productcraft/notify` configured before the Version Packages merge.

## Testing

Generated per-op tests; gen-fixture goldens for the client scope; dist smoke ESM + CJS on Node 20.3/20/22/24; `check-dts`; snippets; api-report; webhook verification test with a catalogue event.

## Definition of Done

- [ ] CI green; merged; Version Packages merged on green; `@productcraft/notify` on npm (checked, not assumed); live smoke passes against prod (testing-environment) and its resources are gone.
- [ ] This file deleted in the PR.
