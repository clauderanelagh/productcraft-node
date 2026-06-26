#!/usr/bin/env bash
# Fetch the latest OpenAPI specs from production. Run by
# `.github/workflows/spec-refresh.yml` on a daily cron + manual
# dispatch. Opens a PR if anything changed.

set -euo pipefail

cd "$(dirname "$0")/.."

declare -A surfaces=(
  # Post-rebrand canonical hosts. The surface keys (and Specs/<key>.json
  # filenames + package names) intentionally keep the old product names
  # until the SDK v1.0 public-API rename — only the source hosts moved.
  [platform-auth]="https://api.platform-auth.productcraft.co/docs-json"
  [heimdall]="https://api.auth.productcraft.co/docs-json"
  [envoi]="https://api.mail.productcraft.co/docs-json"
  [agora]="https://social.productcraft.co/docs-json"
  [rally]="https://api.waitlist.productcraft.co/docs-json"
)

for surface in "${!surfaces[@]}"; do
  url="${surfaces[$surface]}"
  echo "› fetching $surface from $url"
  curl -fsSL --max-time 15 "$url" \
    | jq --sort-keys '.' > "Specs/${surface}.json"
done

echo "✓ all specs refreshed; run \`pnpm codegen\` to update packages/<surface>/src/_generated.d.ts"
