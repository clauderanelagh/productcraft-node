# 008 — @productcraft/social 1.1 on the generated surface

**Status:** pending
**Priority:** 8
**Dependencies:** 004; monorepo social-api/045 deployed and the spec refreshed

## Summary

Switch `@productcraft/social` to the generator: `social.community(id)` scope with `.as(actorId)`, typed errors and webhooks, keeping `.client`. Publishes `1.1.0` (additive: resource methods are new, `.client` is unchanged).

## Context

- `docs/sdk-standard.md` sections 2.2, 3, 4, 7.
- Biggest consumer surface: 46 raw calls in productcraft.co docs; conquer-services and WriteWave pin `^0.7.0` and stay there.
- Social README examples use `{communityId}` and do not compile today.

## Requirements

- `packages/social/src/index.ts` is only the product shell (class name, base URL, scope accessors, re-exports; at most 60 lines); everything else generated.
- `.client` still present and typed by the same `paths`; existing `.client` call sites in the repo's tests still compile.
- `package.json` `files` includes `manifest.json` and `api.md`; `npm pack --dry-run` shows them (asserted in CI); `@productcraft/social/testing` subpath exported.
- Live smoke script `scripts/live/social.mjs` against prod in the **testing-environment** workspace: resources named `sdk-smoke-<ts>`, the script first deletes stale `sdk-smoke-*` resources, then creates and deletes its own; <= 5 req/s; key read from `~/.secrets.toml` inside the script (never printed or passed as a tool argument); no change to workspace settings, services, keys or policies. Exercises create, retrieve, list with `for await` over >1 page (use `limit: 1`), an expected 404 caught as `NotFoundError` with a non-empty `requestId` and `docUrl`, a 400 with a non-empty `errors[]`, `lastResponse.requestId` and `withResponse()`.
- Migration guide `docs/migrations/social-1.1.0.md` with a before/after for every call shape our docs and consumers use (inventory: `/mnt/HC_Volume_105482467/work/sdk-dx-2026-11/pcco-inventory.tsv`); old shapes in ` ```ts before ` fences.
- After the release is on npm, tick this product's item in monorepo `tasks/productcraft-co/228` (or 227 for Trawl) so its docs move next.
- `social.community(id)` scope; community-independent routes (communities CRUD, discovery) on the root.
- `.as(actorId)` fills `actor_id` in any body or query that declares it, unless the call passes one (unit-tested on a body op and a query op).
- Nothing removed or renamed from 1.0.0's public surface (API report diff shows additions only).
- Changeset `minor` for `@productcraft/social` (stable release, no pre mode).

## Call-site acceptance (must compile and run)

```ts
const c = social.community(communityId).as(actorId);
const post = await c.posts.create({ body: "hello from the SDK smoke" });
await c.posts.comments.create(post.id, { body: "first" });
const firstPage = await c.posts.list({ limit: 1 });
await c.posts.delete(post.id);
```

## Testing

- The generated per-op test (003), dist ESM/CJS smoke on Node 20/22/24, snippet check, API report diff, and the live smoke above.

## Definition of Done

- [ ] `pnpm run codegen && pnpm run lint && pnpm run build && pnpm run test` green locally (under `flock /tmp/claude-heavy.lock choom -n 1000 --`)
- [ ] PR CI green (`gh pr checks`), then squash-merged; this file deleted in the same PR
- [ ] Changeset added with the bump this task names; release only through `release.yml` (trusted publishing), Version Packages PR merged on green CI. Confirm the version on npm (`npm view`) after it publishes.
- [ ] `docs/sdk-standard.md` updated if the task changed a decision
