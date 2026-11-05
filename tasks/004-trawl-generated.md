# 004 — Trawl on the generated surface

**Status:** pending
**Priority:** 4
**Dependencies:** 003; monorepo trawl-api/005 deployed and the spec refreshed

## Summary

Switch `@productcraft/trawl` to the generator: resource methods from `x-pc-sdk`, the core runtime, typed errors and webhooks, keeping `.client`. Publishes `1.0.0` (pre-release under `next` until 012).

## Context

- `docs/sdk-standard.md` sections 2.2, 3, 4, 7.
- Trawl is first because it is the smallest, cleanest spec (25 ops); it proves the pipeline end to end.
- README quick-start today uses `{workspaceId}` and does not compile.

## Requirements

- `packages/trawl/src/index.ts` is only the product shell (class name, base URL, scope accessors, re-exports); everything else generated.
- `.client` still present and typed by the same `paths`; existing `.client` call sites in the repo's tests still compile.
- `trawl.webhooks.unwrap(payload, headers, secret)` returns the typed event union; the legacy `WebhookController_*` routes are excluded (`x-pc-sdk: false`).
- Live smoke script `scripts/live/trawl.mjs`, run against prod in the **testing-environment** workspace with throwaway resources created and deleted in `finally`, <= 5 req/s, key read from `~/.secrets.toml` inside the script (never printed or passed as a tool argument). Exercises create, retrieve, list with `for await` over >1 page (use `limit: 1`), an expected 404 caught as `NotFoundError` with a non-empty `requestId`, and `withResponse()`.
- Migration guide `docs/migrations/trawl-1.0.0.md` with a before/after for every call shape our docs and consumers use (inventory: `/mnt/HC_Volume_105482467/work/sdk-dx-2026-11/pcco-inventory.tsv`).
- Changeset `major` for `@productcraft/trawl`.

## Call-site acceptance (must compile and run)

```ts
const job = await trawl.jobs.create({ description: "Pricing tiers", json_schema, urls: ["https://example.com/pricing"] });
const again = await trawl.jobs.retrieve(job.id);
await trawl.jobs.cancel(job.id);
for await (const j of trawl.jobs.list({ limit: 10 })) console.log(j.id);
```

## Testing

- Generated-surface unit tests with a mocked fetch for 3 representative ops; dist ESM/CJS smoke; snippet check; the live smoke above.

## Definition of Done

- [ ] `pnpm run codegen && pnpm run lint && pnpm run build && pnpm run test` green locally (under `flock /tmp/claude-heavy.lock choom -n 1000 --`)
- [ ] PR CI green (`gh pr checks`), then squash-merged; this file deleted in the same PR
- [ ] Changeset added with the bump this task names; release only through `release.yml` (trusted publishing). Confirm the version on npm after the Version Packages PR merges.
- [ ] `docs/sdk-standard.md` updated if the task changed a decision
