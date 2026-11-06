#!/usr/bin/env bash
# Regenerate every package's generated code from its OpenAPI document.
# `pnpm run codegen` is the single entry point.
#
# 1. scripts/gen-sdk.mjs: the generator (docs/sdk-standard.md section 5) for
#    every package switched to it (SURFACES in that script). Writes
#    packages/<p>/src/_generated/ and tests/_generated/ (gitignored) plus the
#    checked-in api.md, README region and examples/<p>/.
# 2. The legacy paths for packages not switched yet (each moves in its task,
#    004 onward): kubb for auth (until 009), openapi-typescript `_generated.d.ts`
#    for the rest. Both outputs are gitignored.

set -euo pipefail

cd "$(dirname "$0")/.."

node scripts/gen-sdk.mjs
switched=" $(node scripts/gen-sdk.mjs --list | tr '\n' ' ') "

# Auth: kubb (retired by task 009)
if [[ "$switched" != *" auth "* ]]; then
  echo "› auth → packages/auth/src/_generated/ (via kubb)"
  pnpm --filter @productcraft/auth exec kubb generate --config kubb.config.ts > /dev/null
fi

# Unswitched surfaces: openapi-typescript (single .d.ts per surface)
for surface in mail waitlist social platform-auth trawl; do
  [[ "$switched" == *" $surface "* ]] && continue
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
