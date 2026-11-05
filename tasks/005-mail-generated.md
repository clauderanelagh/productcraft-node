# 005 — @productcraft/mail 1.0 on the generated surface

**Status:** pending
**Priority:** 5
**Dependencies:** 004; monorepo mail-api/002 and mail-api/063 deployed and the spec refreshed

## Summary

Switch `@productcraft/mail` to the generator: `emails.send` (Resend-shaped), templates, messages, domains with `poll`, typed errors and webhooks, keeping `.client`. Publishes `1.0.0` stable.

## Context

- `docs/sdk-standard.md` sections 2.2, 3, 4, 7.
- Supersedes the Node part of monorepo `tasks/mail-api/020-sdk-and-cli-parity.md` (mail-api/063 edits that file).
- Nouns (standard 9.8): `emails` = call-level (send, batch, list, retrieve, metrics); `messages` = per-recipient delivery log (list, retrieve, timeline, body, erase).
- Mail has default, per-domain and endpoint webhook secrets plus `X-Mail-Signature`; `unwrap` accepts an array of secrets and either scheme.
- WriteWave pins mail `^0.1.1` and stays there (standard section 11).

## Requirements

- `packages/mail/src/index.ts` is only the product shell (class name, base URL, scope accessors, re-exports; at most 60 lines); everything else generated.
- `.client` still present and typed by the same `paths`; existing `.client` call sites in the repo's tests still compile.
- `package.json` `files` includes `manifest.json` and `api.md`; `npm pack --dry-run` shows them (asserted in CI); `@productcraft/mail/testing` subpath exported.
- Live smoke script `scripts/live/mail.mjs` against prod in the **testing-environment** workspace: resources named `sdk-smoke-<ts>`, the script first deletes stale `sdk-smoke-*` resources, then creates and deletes its own; <= 5 req/s; key read from `~/.secrets.toml` inside the script (never printed or passed as a tool argument); no change to workspace settings, services, keys or policies. Exercises create, retrieve, list with `for await` over >1 page (use `limit: 1`), an expected 404 caught as `NotFoundError` with a non-empty `requestId` and `docUrl`, a 400 with a non-empty `errors[]`, `lastResponse.requestId` and `withResponse()`.
- Migration guide `docs/migrations/mail-1.0.0.md` with a before/after for every call shape our docs and consumers use (inventory: `/mnt/HC_Volume_105482467/work/sdk-dx-2026-11/pcco-inventory.tsv`); old shapes in ` ```ts before ` fences.
- After the release is on npm, tick this product's item in monorepo `tasks/productcraft-co/228` (or 227 for Trawl) so its docs move next.
- Template send fully typed (`data: Record<string, unknown>`); `emails.send` typed from mail-api/002's DTO; the auto Idempotency-Key is sent on both (verify `Idempotent-Replay` on a forced retry in the live smoke, sending only to `success@simulator.amazonses.com`).
- `messages.erase({ recipient })` (not `delete`); exports, raw MIME, attachments and message bodies return `Response`.
- `mail.domains.poll(id)` from `x-pc-sdk.poll`.
- README webhook section includes the Next, Express and Hono raw-body recipes (generated).
- Changeset `major` for `@productcraft/mail` (stable release, no pre mode).

## Call-site acceptance (must compile and run)

```ts
await mail.emails.send({ from: "SDK smoke <smoke@<testing-environment domain>>", to: "success@simulator.amazonses.com", subject: "sdk-smoke", html: "<p>ok</p>" });
await mail.templates.send("welcome", { to: "success@simulator.amazonses.com", data: { first_name: "Ada" } });
for await (const m of mail.messages.list({ limit: 25, status: ["delivered"] })) console.log(m.id);
const { data, requestId } = await mail.domains.list().withResponse();
const csv = await (await mail.messages.export({})).text();
```

## Testing

- The generated per-op test (003), dist ESM/CJS smoke on Node 20/22/24, snippet check, API report diff, and the live smoke above.

## Definition of Done

- [ ] `pnpm run codegen && pnpm run lint && pnpm run build && pnpm run test` green locally (under `flock /tmp/claude-heavy.lock choom -n 1000 --`)
- [ ] PR CI green (`gh pr checks`), then squash-merged; this file deleted in the same PR
- [ ] Changeset added with the bump this task names; release only through `release.yml` (trusted publishing), Version Packages PR merged on green CI. Confirm the version on npm (`npm view`) after it publishes.
- [ ] `docs/sdk-standard.md` updated if the task changed a decision
