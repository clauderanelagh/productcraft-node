#!/usr/bin/env bash
# Regenerate per-package OpenAPI types from Specs/<surface>.json.
# Writes to packages/<surface>/src/_generated.d.ts (gitignored).

set -euo pipefail

cd "$(dirname "$0")/.."

surfaces=(heimdall envoi rally agora platform-auth)

for surface in "${surfaces[@]}"; do
  spec="Specs/${surface}.json"
  out="packages/${surface}/src/_generated.d.ts"
  if [[ ! -f "$spec" ]]; then
    echo "✗ missing spec: $spec" >&2
    exit 1
  fi
  echo "› $surface → $out"
  pnpm exec openapi-typescript "$spec" -o "$out"
done

echo "✓ codegen complete"
