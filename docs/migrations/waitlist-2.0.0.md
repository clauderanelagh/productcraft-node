# Migrating to @productcraft/waitlist 2.0

2.0 changes one response shape: the per-row error of `lists.entries.bulk()`. Everything else is additive. The Waitlist API already sends the new shape (since 2026-11-07), so code on 1.x that reads `error.code` as a number gets a string at runtime today; 2.0 makes the types match.

<!-- snippet-preamble: import { Waitlist } from "@productcraft/waitlist"; const waitlist = new Waitlist(); const waitlistId = "3f0c1a2b-4c5d-4e6f-8a9b-0c1d2e3f4a5b"; const ids = ["150489b4-0a1b-4c2d-8e3f-405162738495"]; -->

## Bulk row errors carry the error code

A failed row was `{ code: 404, message }`, with the HTTP status in `code`. It is now `{ code, status_code, message }`: `code` is the same `Waitlist.ErrorCode` a thrown error carries (`NOT_FOUND`, `CONFLICT`, ...), and the status moved to `status_code`.

```ts before
const result = await waitlist.lists.entries.bulk(waitlistId, { ids, action: "approve" });
for (const row of result.results) {
  if (row.error?.code === 404) console.log(`${row.id} is gone`);
}
```

```ts
const result = await waitlist.lists.entries.bulk(waitlistId, { ids, action: "approve" });
for (const row of result.results) {
  if (row.error?.code === "NOT_FOUND") console.log(`${row.id} is gone`);
  else if (row.error) console.log(row.error.status_code, row.error.message);
}
```

## Also in 2.0 (additive)

- `settings.notifications.test(slot)` takes `"welcome" | "approved" | "rejected"`, not any string. A `string` variable needs narrowing to one of those first.
- `@productcraft/waitlist/testing` exports `signWebhook({ payload, secret })` to sign a test event for your webhook handler.
