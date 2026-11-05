#!/usr/bin/env bash
# Fetch the latest OpenAPI specs from production. Run by
# `.github/workflows/spec-refresh.yml` on a daily cron + manual
# dispatch. Opens a PR if anything changed.
#
# Fails loudly: if any API's /docs-json is unreachable, returns a non-2xx,
# or returns something that isn't an OpenAPI 3 document with paths, the
# script exits non-zero after trying every surface, and the vendored
# Specs/<surface>.json for that surface is left untouched (never truncated,
# never silently stale while the run reports success).

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

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

failed=()
for surface in $(printf '%s\n' "${!surfaces[@]}" | sort); do
  url="${surfaces[$surface]}"
  echo "› fetching $surface from $url"
  raw="$tmp/${surface}.raw.json"
  if ! curl -fsSL --max-time 30 --retry 3 --retry-delay 5 --retry-all-errors \
      -o "$raw" "$url"; then
    echo "::error title=spec refresh failed::$surface: $url unreachable or returned an error status" >&2
    failed+=("$surface")
    continue
  fi
  if ! jq -e '(.openapi | type == "string" and startswith("3."))
              and (.paths | type == "object" and length > 0)' "$raw" >/dev/null 2>&1; then
    echo "::error title=spec refresh failed::$surface: $url did not return an OpenAPI 3 document with paths" >&2
    failed+=("$surface")
    continue
  fi
  jq --sort-keys '.' "$raw" > "$tmp/${surface}.json"
  mv "$tmp/${surface}.json" "Specs/${surface}.json"
  echo "  ✓ $surface: $(jq '[.paths[] | keys[] | select(. != "parameters")] | length' "Specs/${surface}.json") operations"
done

if (( ${#failed[@]} > 0 )); then
  echo "✗ spec refresh failed for: ${failed[*]} (their vendored specs were NOT updated)" >&2
  exit 1
fi

echo "✓ all specs refreshed; run \`pnpm codegen\` to update packages/<surface>/src/_generated.d.ts"
