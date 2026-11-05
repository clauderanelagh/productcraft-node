# 005 — Mail on the generated surface

**Status:** pending
**Priority:** 5
**Dependencies:** 004; monorepo mail-api/063 deployed and the spec refreshed

## Summary

Switch `@productcraft/mail` to the generator: resource methods from `x-pc-sdk`, the core runtime, typed errors and webhooks, keeping `.client`. Publishes `1.0.0` (pre-release under `next` until 012).

## Context

- `docs/sdk-standard.md` sections 2.2, 3, 4, 7.
- Supersedes the Node part of monorepo `tasks/mail-api/020-sdk-and-cli-parity.md` (update that file to say so in the monorepo docs PR 227).
- Mail has both the Standard Webhooks header and `X-Mail-Signature`; `verifyWebhook` accepts either.

## Requirements

- `packages/mail/src/index.ts` is only the product shell (class name, base URL, scope accessors, re-exports); everything else generated.
- `.client` still present and typed by the same `paths`; existing `.client` call sites in the repo's tests still compile.
- Template send is fully typed (`data: Record<string, unknown>`), and the auto Idempotency-Key is sent on it (verify the `Idempotent-Replay` header on a forced retry in the live smoke, sending only to `success@simulator.amazonses.com`).
- Live smoke script `scripts/live/mail.mjs`, run against prod in the **testing-environment** workspace with throwaway resources created and deleted in `finally`, <= 5 req/s, key read from `~/.secrets.toml` inside the script (never printed or passed as a tool argument). Exercises create, retrieve, list with `for await` over >1 page (use `limit: 1`), an expected 404 caught as `NotFoundError` with a non-empty `requestId`, and `withResponse()`.
- Migration guide `docs/migrations/mail-1.0.0.md` with a before/after for every call shape our docs and consumers use (inventory: `/mnt/HC_Volume_105482467/work/sdk-dx-2026-11/pcco-inventory.tsv`).
- Changeset `major` for `@productcraft/mail`.

## Call-site acceptance (must compile and run)

```ts
await mail.templates.send("welcome", { to: "success@simulator.amazonses.com", data: { first_name: "Ada" } });
for await (const m of mail.messages.list({ limit: 25 })) console.log(m.id);
const { data, requestId } = await mail.domains.list().withResponse();
```

## Testing

- Generated-surface unit tests with a mocked fetch for 3 representative ops; dist ESM/CJS smoke; snippet check; the live smoke above.

## Definition of Done

- [ ] `pnpm run codegen && pnpm run lint && pnpm run build && pnpm run test` green locally (under `flock /tmp/claude-heavy.lock choom -n 1000 --`)
- [ ] PR CI green (`gh pr checks`), then squash-merged; this file deleted in the same PR
- [ ] Changeset added with the bump this task names; release only through `release.yml` (trusted publishing). Confirm the version on npm after the Version Packages PR merges.
- [ ] `docs/sdk-standard.md` updated if the task changed a decision
