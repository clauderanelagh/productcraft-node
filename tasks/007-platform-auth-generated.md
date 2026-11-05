# 007 — @productcraft/platform-auth 1.0 on the generated surface

**Status:** pending
**Priority:** 7
**Dependencies:** 004; monorepo platform-auth-api/021 deployed and the spec refreshed

## Summary

Switch `@productcraft/platform-auth` to the generator, keeping `.client`. Publishes `1.0.0` stable.

## Context

- `docs/sdk-standard.md` sections 2.2, 3, 4, 7.
- Platform uses `{workspace_slug}` (positional, not bound); `apiKeys.self()` is what core uses to resolve a default `workspaceId`.
- conquer-api calls `.client.POST('/v1/introspect/api-key')` on platform-auth `^0.0.12` and stays on that pin; the call must still compile on 1.0 for when it upgrades.

## Requirements

- `packages/platform-auth/src/index.ts` is only the product shell (class name, base URL, scope accessors, re-exports; at most 60 lines); everything else generated.
- `.client` still present and typed by the same `paths`; existing `.client` call sites in the repo's tests still compile.
- `package.json` `files` includes `manifest.json` and `api.md`; `npm pack --dry-run` shows them (asserted in CI); `@productcraft/platform-auth/testing` subpath exported.
- Live smoke script `scripts/live/platform-auth.mjs` against prod in the **testing-environment** workspace: resources named `sdk-smoke-<ts>`, the script first deletes stale `sdk-smoke-*` resources, then creates and deletes its own; <= 5 req/s; key read from `~/.secrets.toml` inside the script (never printed or passed as a tool argument); no change to workspace settings, services, keys or policies. Exercises create, retrieve, list with `for await` over >1 page (use `limit: 1`), an expected 404 caught as `NotFoundError` with a non-empty `requestId` and `docUrl`, a 400 with a non-empty `errors[]`, `lastResponse.requestId` and `withResponse()`.
- Migration guide `docs/migrations/platform-auth-1.0.0.md` with a before/after for every call shape our docs and consumers use (inventory: `/mnt/HC_Volume_105482467/work/sdk-dx-2026-11/pcco-inventory.tsv`); old shapes in ` ```ts before ` fences.
- After the release is on npm, tick this product's item in monorepo `tasks/productcraft-co/228` (or 227 for Trawl) so its docs move next.
- Only the paged API-key list shape is generated (legacy array shape excluded by platform-auth-api/021).
- Live smoke creates and revokes only an `sdk-smoke-` API key it created itself; never touches other keys.
- Changeset `major` for `@productcraft/platform-auth` (stable release, no pre mode).

## Call-site acceptance (must compile and run)

```ts
const me = await platform.apiKeys.self();
const ws = await platform.workspaces.retrieve("testing-environment");
for await (const k of platform.workspaces.apiKeys.list(ws.slug)) console.log(k.id);
```

## Testing

- The generated per-op test (003), dist ESM/CJS smoke on Node 20/22/24, snippet check, API report diff, and the live smoke above.

## Definition of Done

- [ ] `pnpm run codegen && pnpm run lint && pnpm run build && pnpm run test` green locally (under `flock /tmp/claude-heavy.lock choom -n 1000 --`)
- [ ] PR CI green (`gh pr checks`), then squash-merged; this file deleted in the same PR
- [ ] Changeset added with the bump this task names; release only through `release.yml` (trusted publishing), Version Packages PR merged on green CI. Confirm the version on npm (`npm view`) after it publishes.
- [ ] `docs/sdk-standard.md` updated if the task changed a decision
