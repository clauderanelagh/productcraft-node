#!/usr/bin/env bash
# Regenerate per-package types/clients from Specs/<surface>.json.
#
# Auth uses kubb (per-tag ergonomic methods + full type tree)
# and writes to packages/auth/src/_generated/. Other surfaces
# still use openapi-typescript (types only — the wrapper class wraps
# openapi-fetch by hand) and write a single _generated.d.ts.
#
# Both targets are gitignored.

set -euo pipefail

cd "$(dirname "$0")/.."

# Auth — kubb
echo "› auth → packages/auth/src/_generated/ (via kubb)"
pnpm --filter @productcraft/auth exec kubb generate --config kubb.config.ts > /dev/null

# Other surfaces — openapi-typescript (single .d.ts per surface)
for surface in mail waitlist social platform-auth trawl; do
  spec="Specs/${surface}.json"
  out="packages/${surface}/src/_generated.d.ts"
  if [[ ! -f "$spec" ]]; then
    echo "✗ missing spec: $spec" >&2
    exit 1
  fi
  echo "› $surface → $out (via openapi-typescript)"
  pnpm exec openapi-typescript "$spec" -o "$out"
done

echo "✓ codegen complete"
