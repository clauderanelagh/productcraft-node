# 008 — Social on the generated surface

**Status:** pending
**Priority:** 8
**Dependencies:** 004; monorepo social-api/045 deployed and the spec refreshed

## Summary

Switch `@productcraft/social` to the generator: resource methods from `x-pc-sdk`, the core runtime, typed errors and webhooks, keeping `.client`. Publishes `2.0.0` (pre-release under `next` until 012).

## Context

- `docs/sdk-standard.md` sections 2.2, 3, 4, 7.
- Biggest consumer surface: 46 raw calls in productcraft.co docs, 19 in conquer-services, 10 in WriteWave (on 0.7). `.client` keeps all of them compiling.
- Social README examples use `{communityId}` and do not compile today.

## Requirements

- `packages/social/src/index.ts` is only the product shell (class name, base URL, scope accessors, re-exports); everything else generated.
- `.client` still present and typed by the same `paths`; existing `.client` call sites in the repo's tests still compile.
- `social.community(id)` scope; community-independent routes (communities CRUD, discovery) on the root.
- Live smoke script `scripts/live/social.mjs`, run against prod in the **testing-environment** workspace with throwaway resources created and deleted in `finally`, <= 5 req/s, key read from `~/.secrets.toml` inside the script (never printed or passed as a tool argument). Exercises create, retrieve, list with `for await` over >1 page (use `limit: 1`), an expected 404 caught as `NotFoundError` with a non-empty `requestId`, and `withResponse()`.
- Migration guide `docs/migrations/social-2.0.0.md` with a before/after for every call shape our docs and consumers use (inventory: `/mnt/HC_Volume_105482467/work/sdk-dx-2026-11/pcco-inventory.tsv`).
- Changeset `major` for `@productcraft/social`.

## Call-site acceptance (must compile and run)

```ts
const c = social.community(communityId);
const post = await c.posts.create({ actor_id, body: "hello from the SDK smoke" });
await c.posts.comments.create(post.id, { actor_id, body: "first" });
const firstPage = await c.posts.list({ limit: 1 });
await c.posts.delete(post.id);
```

## Testing

- Generated-surface unit tests with a mocked fetch for 3 representative ops; dist ESM/CJS smoke; snippet check; the live smoke above.

## Definition of Done

- [ ] `pnpm run codegen && pnpm run lint && pnpm run build && pnpm run test` green locally (under `flock /tmp/claude-heavy.lock choom -n 1000 --`)
- [ ] PR CI green (`gh pr checks`), then squash-merged; this file deleted in the same PR
- [ ] Changeset added with the bump this task names; release only through `release.yml` (trusted publishing). Confirm the version on npm after the Version Packages PR merges.
- [ ] `docs/sdk-standard.md` updated if the task changed a decision
