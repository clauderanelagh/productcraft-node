# Tasks — productcraft-node

Open backlog for the Node SDK workspace. Same conventions as `monorepo/tasks/`:

- Flat `NNN-short-name.md` files at this level (the program is cross-package).
- Files named `NNN-short-name.md`. Lower N = higher priority.
- Task frontmatter follows the table at `monorepo/tasks/README.md` (Title / Status / Priority / Dependencies / Summary / Context / Requirements / Out of Scope / Affected Files / Testing / Definition of Done).
- When the task lands, **delete the file in the same PR.** `done` is not a resting state.

## Current program

**Flags (2026-11-08).** A new product, ProductCraft Flags (ConfigCat-style feature flags with local evaluation). Spec: `monorepo/internal_docs/flags/prd.md` and `design.md`; the cross-repo build order is design section 15. The SDK tasks here are:

- `014-flags-engine-and-vectors.md`: `@productcraft/flags-engine` (pure engine, spec, vectors) and the SDK-standard amendment for local-evaluation code. Can start now.
- `015-flags-sdk.md`: `@productcraft/flags` (generated management client + `FlagsClient`). Needs 014 and the monorepo flags-api SDK-grade spec deployed.
- `016-flags-openfeature-provider.md`: `@productcraft/flags-openfeature`. Needs 015.
- `019-flags-browser-and-react.md`: the browser entry of `@productcraft/flags` and `@productcraft/flags-react`. Needs 015 (added after the 2026-11-08 reviews, design section 18).

**Notify (2026-11-08).** A new product, ProductCraft Notify (notifications: in-app inbox, email via Mail, web push, APNs, FCM). Spec: `monorepo/internal_docs/notify/prd.md` and `design.md`; the cross-repo build order is design section 17.2. The SDK tasks here are:

- `017-notify-sdk.md`: `@productcraft/notify` (generated, with the recipient-token `client()` scope). Needs monorepo notify-api/012 deployed.
- `018-notify-js-client-core.md`: `@productcraft/notify-js` (framework-agnostic browser core: token refresh, SSE stream, inbox store, preferences, web push helper and service worker) and the SDK-standard amendment for a hand-written browser package. Needs 017.
- `020-notify-react.md`: `@productcraft/notify-react` (`<NotifyInbox/>`, `<NotifyPreferences/>`, hooks), a thin wrapper over 018 (019 is Flags). Needs 018.

The previous program (Stripe-grade SDKs, 2026-11) is complete: task 012 shipped the last stable releases on 2026-11-07; its build order is in [`docs/sdk-standard.md`](../docs/sdk-standard.md) section 11. 013 (local webhook loop) is independent.
