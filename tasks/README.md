# Tasks — productcraft-node

Open backlog for the Node SDK workspace. Same conventions as `monorepo/tasks/`:

- One subdirectory per package.
- Files named `NNN-short-name.md`. Lower N = higher priority.
- Task frontmatter follows the table at `monorepo/tasks/README.md` (Title / Status / Priority / Dependencies / Summary / Context / Requirements / Out of Scope / Affected Files / Testing / Definition of Done).
- When the task lands, **delete the file in the same PR.** `done` is not a resting state.

## Why these exist

The SDK launch (heimdall@0.1.0 + the six other surfaces at 0.0.3) shipped READMEs that were generated against the live OpenAPI specs but, in places, drifted from the actual product positioning. Each task below is one package's "is this README + package.json description + quick-start example actually right" audit.

These should land **before** the productcraft.co guide-toggle tasks (`monorepo/tasks/productcraft-co/`) so the on-site SDK examples are accurate when the toggle ships across the docs.
