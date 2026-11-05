# Tasks — productcraft-node

Open backlog for the Node SDK workspace. Same conventions as `monorepo/tasks/`:

- Flat `NNN-short-name.md` files at this level (the program is cross-package).
- Files named `NNN-short-name.md`. Lower N = higher priority.
- Task frontmatter follows the table at `monorepo/tasks/README.md` (Title / Status / Priority / Dependencies / Summary / Context / Requirements / Out of Scope / Affected Files / Testing / Definition of Done).
- When the task lands, **delete the file in the same PR.** `done` is not a resting state.

## Current program

The Stripe-grade SDK program (2026-11). The standard and the full cross-repo build order are in [`docs/sdk-standard.md`](../docs/sdk-standard.md), section 11. The monorepo spec-annotation tasks (`monorepo/tasks/{monorepo,trawl-api,mail-api,waitlist-api,platform-auth-api,social-api,users-api}/`) come before 003 here, and the monorepo docs and console migrations come before 012.
