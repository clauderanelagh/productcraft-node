# 004 — @productcraft/trawl 1.0 on the generated surface

**Status:** pending
**Priority:** 4
**Dependencies:** 003; monorepo trawl-api/005 deployed and the spec refreshed

## Summary

Switch `@productcraft/trawl` to the generator: resource methods from `x-pc-sdk`, the core runtime, typed errors, polling and webhooks, keeping `.client`. Publishes `1.0.0` stable. First generated package, so it also proves the publish shape (manifest, api.md, testing subpath) that productcraft-co/227 consumes.

## Context

- `docs/sdk-standard.md` sections 2.2, 3, 4, 7.
- Trawl is first because it is the smallest, cleanest spec (25 ops); it proves the pipeline end to end.
- README quick-start today uses `{workspaceId}` and does not compile.
- productcraft.co pins `@productcraft/trawl 0.2.0` exactly (Workbench); 227 moves it.

## Requirements

- `packages/trawl/src/index.ts` is only the product shell (class name, base URL, scope accessors, re-exports; at most 60 lines); everything else generated.
- `.client` still present and typed by the same `paths`; existing `.client` call sites in the repo's tests still compile.
- `package.json` `files` includes `manifest.json` and `api.md`; `npm pack --dry-run` shows them (asserted in CI); `@productcraft/trawl/testing` subpath exported.
- Live smoke script `scripts/live/trawl.mjs` against prod in the **testing-environment** workspace: resources named `sdk-smoke-<ts>`, the script first deletes stale `sdk-smoke-*` resources, then creates and deletes its own; <= 5 req/s; key read from `~/.secrets.toml` inside the script (never printed or passed as a tool argument); no change to workspace settings, services, keys or policies. Exercises create, retrieve, list with `for await` over >1 page (use `limit: 1`), an expected 404 caught as `NotFoundError` with a non-empty `requestId` and `docUrl`, a 400 with a non-empty `errors[]`, `lastResponse.requestId` and `withResponse()`.
- Migration guide `docs/migrations/trawl-1.0.0.md` with a before/after for every call shape our docs and consumers use (inventory: `/mnt/HC_Volume_105482467/work/sdk-dx-2026-11/pcco-inventory.tsv`); old shapes in ` ```ts before ` fences.
- After the release is on npm, tick this product's item in monorepo `tasks/productcraft-co/228` (or 227 for Trawl) so its docs move next.
- `trawl.jobs.poll(id)` and `trawl.jobs.createAndPoll<T>(params)` from `x-pc-sdk.poll`, with `result` typed as `T`.
- `trawl.webhooks.unwrap({ payload, headers, secret? })` returns the typed event union incl. `UnknownWebhookEvent`; the legacy `WebhookController_*` routes are excluded (`x-pc-sdk: false`).
- Live smoke additionally proves `X-Request-Id` (monorepo/020) and a retried create reusing its key.
- Changeset `major` for `@productcraft/trawl` (stable release, no pre mode).

## Call-site acceptance (must compile and run)

```ts
type Tiers = { tiers: { name: string }[] };
const job = await trawl.jobs.create({ description: "Pricing tiers", json_schema, urls: ["https://example.com/pricing"] });
const again = await trawl.jobs.retrieve(job.id);
await trawl.jobs.cancel(job.id);
for await (const j of trawl.jobs.list({ limit: 10 })) console.log(j.id);
const done = await trawl.jobs.createAndPoll<Tiers>({ description: "Pricing tiers", json_schema, urls: ["https://example.com/pricing"] }, { timeoutMs: 300_000 });
```

## Testing

- The generated per-op test (003), dist ESM/CJS smoke on Node 20/22/24, snippet check, API report diff, and the live smoke above.

## Definition of Done

- [ ] `pnpm run codegen && pnpm run lint && pnpm run build && pnpm run test` green locally (under `flock /tmp/claude-heavy.lock choom -n 1000 --`)
- [ ] PR CI green (`gh pr checks`), then squash-merged; this file deleted in the same PR
- [ ] Changeset added with the bump this task names; release only through `release.yml` (trusted publishing), Version Packages PR merged on green CI. Confirm the version on npm (`npm view`) after it publishes.
- [ ] `docs/sdk-standard.md` updated if the task changed a decision
