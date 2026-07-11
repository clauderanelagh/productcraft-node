#!/usr/bin/env bash
# Fetch the latest OpenAPI specs from production. Run by
# `.github/workflows/spec-refresh.yml` on a daily cron + manual
# dispatch. Opens a PR if anything changed.

set -euo pipefail

cd "$(dirname "$0")/.."

declare -A surfaces=(
  # Surface keys match the rebranded package names (auth/mail/waitlist/
  # social) since the 2026-07 SDK rename; Specs/<key>.json follows suit.
  [platform-auth]="https://api.platform-auth.productcraft.co/docs-json"
  [auth]="https://api.auth.productcraft.co/docs-json"
  [mail]="https://api.mail.productcraft.co/docs-json"
  [social]="https://social.productcraft.co/docs-json"
  [waitlist]="https://api.waitlist.productcraft.co/docs-json"
  [trawl]="https://api.trawl.productcraft.co/docs-json"
)

for surface in "${!surfaces[@]}"; do
  url="${surfaces[$surface]}"
  echo "› fetching $surface from $url"
  curl -fsSL --max-time 15 "$url" \
    | jq --sort-keys '.' > "Specs/${surface}.json"
done

echo "✓ all specs refreshed; run \`pnpm codegen\` to update packages/<surface>/src/_generated.d.ts"
