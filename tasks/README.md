# Tasks — productcraft-node

Open backlog for the Node SDK workspace. Same conventions as `monorepo/tasks/`:

- Flat `NNN-short-name.md` files at this level (the program is cross-package).
- Files named `NNN-short-name.md`. Lower N = higher priority.
- Task frontmatter follows the table at `monorepo/tasks/README.md` (Title / Status / Priority / Dependencies / Summary / Context / Requirements / Out of Scope / Affected Files / Testing / Definition of Done).
- When the task lands, **delete the file in the same PR.** `done` is not a resting state.

## Current program

The Stripe-grade SDK program (2026-11). The standard and the full cross-repo build order are in [`docs/sdk-standard.md`](../docs/sdk-standard.md), section 11, which interleaves these tasks with the monorepo spec tasks (`monorepo/tasks/{monorepo,trawl-api,mail-api,waitlist-api,platform-auth-api,social-api,users-api,console,productcraft-co}/`). Each product task depends on its API's spec task being deployed; 001-003 do not wait for them. There is no 011 (folded into 003, 004 and 012).
