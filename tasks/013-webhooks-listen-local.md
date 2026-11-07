# 013 — Receive webhooks locally (`stripe listen`-style loop)

| Field | Value |
|---|---|
| Title | Local webhook loop for every product with webhooks |
| Status | open |
| Priority | low |
| Dependencies | A relay design decision (see Context); no SDK work blocks on it |
| Summary | Let a developer receive real webhook deliveries on `localhost` without a public URL. |

## Context

App-trawl review, 2026-11-07: `webhooks.endpoints.test` only reaches a public https URL, so there is no local loop like `stripe listen --forward-to localhost:3000/webhooks`. Test signing is solved (`signWebhook` in every product's `/testing`, `webhooks.sign()` on the client); this task is the receive side.

Options:
1. **Relay endpoint + CLI.** A `productcraft listen` CLI opens an authenticated long-lived connection (SSE or WebSocket) to a relay route in the shared webhooks lib; the lib delivers to a per-session virtual endpoint and the CLI re-signs with a session secret and POSTs to the local URL. Needs a new public API surface and an npm bin package. Costs nothing new, but it is a product decision on a new surface.
2. **Replay into localhost.** A CLI that pages `webhooks.events.list()`, then signs each event with a local secret (`signWebhook`) and POSTs it to the local URL. No server work; covers the "what did my handler do with yesterday's events" loop, not live delivery.

Option 2 is SDK-only and can ship first; option 1 is a new platform surface.

## Requirements

- Option 2: `@productcraft/<product>/testing` gains `forwardEvents({ client, to, secret, since? })`, or an umbrella bin `productcraft webhooks forward`. Signs with Standard Webhooks headers; never sends the endpoint's real secret anywhere.
- Option 1 (only after a design note): relay route documented in OpenAPI, rate-limited, scoped to the caller's workspace.

## Out of Scope

Tunnelling (ngrok-style) of arbitrary traffic.

## Testing

Unit tests with `createMockFetch` + a local http server receiving the forwarded, verifiable events (`unwrap` accepts them).

## Definition of Done

Merged, released through release.yml, README Testing section documents it, one live forward from testing-environment events to a local server.
