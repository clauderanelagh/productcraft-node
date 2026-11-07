# Migrating to @productcraft/core 1.0

`@productcraft/core` 1.0 declares the shared runtime stable: `APIClient`, retries, timeouts, automatic idempotency keys, typed errors, pagination, polling and `verifyWebhook`. Most apps never import core directly; they get it through a product package or the `productcraft` umbrella.

**Nothing was removed.** Code written against core 0.x compiles and runs unchanged on 1.0. The major marks the runtime as stable and moves the floor to Node 20.3.

## What to check

- **Node 20.3 or later.** Node 18 is end-of-life and no longer supported.
- **The 0.x helpers are deprecated, not gone.** `makeClient`, `PCAuth` and `PC_BASE_URL` still work and are removed no earlier than core 2.0. New code uses a product package (`new Mail({ apiKey })`), which builds the runtime for you. Each product client keeps `.client`, the typed `openapi-fetch` escape hatch that `makeClient` used to return.
- **New option `credentialFromEnv`** (default `true`). Pass `false` to stop a client from falling back to `PRODUCTCRAFT_API_KEY`.

## Errors

Import error classes from core or from any product package; they are the same classes, and `instanceof` works across both module formats and duplicate installs.

```ts
import { APIError, NotFoundError } from "@productcraft/core";

declare function call(): Promise<unknown>;

try {
  await call();
} catch (err) {
  if (err instanceof NotFoundError) console.log("missing", err.requestId);
  else if (err instanceof APIError) console.log(err.status, err.code, err.body);
  else throw err;
}
```

## Webhooks

`verifyWebhook` takes the raw body, the headers and your endpoint secret, and returns the parsed event or throws `WebhookVerificationError`:

```ts
import { verifyWebhook } from "@productcraft/core";

declare const rawBody: string;
declare const headers: Record<string, string>;

const event = await verifyWebhook<{ type: string }>({ payload: rawBody, headers, secret: process.env.WEBHOOK_SECRET! });
console.log(event.type);
```
