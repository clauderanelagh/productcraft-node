# Changesets

This dir holds pending version bumps. The release workflow opens a "Version Packages" PR that consumes the markdown files here, bumps versions in `package.json` for each affected package, and updates each package's CHANGELOG.md. Merging that PR publishes the changed packages to npm.

Run `pnpm changeset` to add a new entry interactively.

For spec-refresh PRs the entry is generated automatically by `scripts/changeset-from-spec-diff.sh` — see `.github/workflows/spec-refresh.yml`.
