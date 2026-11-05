# 006 — @productcraft/waitlist 1.0 on the generated surface

**Status:** pending
**Priority:** 6
**Dependencies:** 004; monorepo waitlist-api/008 deployed and the spec refreshed

## Summary

Switch `@productcraft/waitlist` to the generator: `waitlist.lists.*` (root alias for `waitlists`), the keyless `waitlist.public({ workspace, waitlist })` scope, typed errors and webhooks, keeping `.client`. Publishes `1.0.0` stable.

## Context

- `docs/sdk-standard.md` sections 2.2, 3, 4, 7.
- Public submit routes (`/v1/waitlists/{workspace_slug}/{waitlist_slug}/entries`) need no key and must work from a browser bundle.
- `PATCH waitlists/{id}/status` becomes `lists.updateStatus(id)`; `entries/count` becomes `lists.entries.count(id)`; `entries/export.csv` returns `Response`.

## Requirements

- `packages/waitlist/src/index.ts` is only the product shell (class name, base URL, scope accessors, re-exports; at most 60 lines); everything else generated.
- `.client` still present and typed by the same `paths`; existing `.client` call sites in the repo's tests still compile.
- `package.json` `files` includes `manifest.json` and `api.md`; `npm pack --dry-run` shows them (asserted in CI); `@productcraft/waitlist/testing` subpath exported.
- Live smoke script `scripts/live/waitlist.mjs` against prod in the **testing-environment** workspace: resources named `sdk-smoke-<ts>`, the script first deletes stale `sdk-smoke-*` resources, then creates and deletes its own; <= 5 req/s; key read from `~/.secrets.toml` inside the script (never printed or passed as a tool argument); no change to workspace settings, services, keys or policies. Exercises create, retrieve, list with `for await` over >1 page (use `limit: 1`), an expected 404 caught as `NotFoundError` with a non-empty `requestId` and `docUrl`, a 400 with a non-empty `errors[]`, `lastResponse.requestId` and `withResponse()`.
- Migration guide `docs/migrations/waitlist-1.0.0.md` with a before/after for every call shape our docs and consumers use (inventory: `/mnt/HC_Volume_105482467/work/sdk-dx-2026-11/pcco-inventory.tsv`); old shapes in ` ```ts before ` fences.
- After the release is on npm, tick this product's item in monorepo `tasks/productcraft-co/228` (or 227 for Trawl) so its docs move next.
- `new Waitlist()` with no key works for public routes; `public` methods send no Authorization header and no Idempotency-Key unless the spec declares it, and never trip the browser guard. A keyed client in a browser throws without `dangerouslyAllowBrowser` (unit test with a fake `window`).
- Changeset `major` for `@productcraft/waitlist` (stable release, no pre mode).

## Call-site acceptance (must compile and run)

```ts
const wl = await waitlist.lists.create({ name: "Beta", slug: `sdk-smoke-${Date.now()}` });
await new Waitlist().public({ workspace: "testing-environment", waitlist: wl.slug }).entries.create({ email: "success@simulator.amazonses.com" });
for await (const e of waitlist.lists.entries.list(wl.id)) console.log(e.email);
await waitlist.lists.delete(wl.id);
```

## Testing

- The generated per-op test (003), dist ESM/CJS smoke on Node 20/22/24, snippet check, API report diff, and the live smoke above.

## Definition of Done

- [ ] `pnpm run codegen && pnpm run lint && pnpm run build && pnpm run test` green locally (under `flock /tmp/claude-heavy.lock choom -n 1000 --`)
- [ ] PR CI green (`gh pr checks`), then squash-merged; this file deleted in the same PR
- [ ] Changeset added with the bump this task names; release only through `release.yml` (trusted publishing), Version Packages PR merged on green CI. Confirm the version on npm (`npm view`) after it publishes.
- [ ] `docs/sdk-standard.md` updated if the task changed a decision
