# @productcraft/core

The shared runtime behind the ProductCraft Node.js SDKs: requests with retries, timeouts, automatic idempotency keys, typed errors, pagination, polling and webhook verification.

You **don't usually install this directly**. Every product SDK (`@productcraft/auth`, `@productcraft/mail`, `@productcraft/waitlist`, `@productcraft/social`, `@productcraft/trawl`, `@productcraft/platform-auth`) and the `productcraft` umbrella depend on it. You import from it for two things: the error classes (also re-exported by the product packages as they move to the generated surface) and `verifyWebhook`.

Requires **Node 20.3 or later** (also Bun, Deno and edge runtimes with `fetch` and `crypto.subtle`).

## Errors

Every failure is a class you can catch. `instanceof` works across the ESM and CJS builds and across duplicate installs (each class is branded with `Symbol.for("productcraft.error.<Name>")`).

```ts
import { APIError, NotFoundError, BadRequestError, RateLimitError } from "@productcraft/core";

try {
  // any SDK call
} catch (err) {
  if (err instanceof NotFoundError) console.log(err.code, err.requestId, err.docUrl);
  else if (err instanceof BadRequestError) err.errors.forEach((e) => console.log(e.param, e.message));
  else if (err instanceof RateLimitError) console.log(err.retryAfter); // seconds
  else throw err;
}
```

| Class | When |
|---|---|
| `ProductCraftError` | Base of everything below |
| `APIError` | Any non-2xx: `status`, `code`, `message`, `errors[]`, `details`, `docUrl`, `requestId`, `headers`, `body` |
| `BadRequestError` 400, `AuthenticationError` 401, `PaymentRequiredError` 402, `PermissionDeniedError` 403, `NotFoundError` 404, `ConflictError` 409, `IdempotencyKeyReuseError` 409 `IDEMPOTENCY_KEY_REUSE`, `UnprocessableEntityError` 422, `RateLimitError` 429, `InternalServerError` 5xx | By status |
| `APIConnectionError`, `APITimeoutError` | No response, or an attempt (or a poll) ran out of time |
| `APIUserAbortError` | Your `AbortSignal` fired |
| `ConfigurationError` | The client cannot work as configured (no `workspaceId`, a key in a browser, no webhook secret) |
| `WebhookVerificationError` | A webhook failed signature or timestamp checks |

## Retries, timeouts and idempotency

- Up to 2 retries (`maxRetries`) on connection errors, 408, 409 `IDEMPOTENCY_IN_PROGRESS`, 429 and 500/502/503/504, with exponential backoff and full jitter (`min(8 s, 0.5 s × 2ⁿ)`). A `Retry-After` (seconds or HTTP date) or `retry-after-ms` of 60 s or less replaces the backoff; anything longer fails fast.
- **A POST or PATCH without an idempotency key is never retried**, not even on a connection error, because the request may already have run. Operations that accept an `Idempotency-Key` get one automatically (`pc_<uuid>`), reused on every retry; pass `idempotencyKey` to choose your own.
- Each attempt times out after 60 s (`timeout`). With the defaults the worst case is about 3 attempts × 60 s plus backoff, roughly 3 minutes. For an overall deadline pass `signal: AbortSignal.timeout(ms)`.
- Idempotency is enforced by the API in Redis. If Redis is unavailable the API still runs the request (fail-open, for availability), so a retry during such an outage can run twice.

## Webhooks

```ts
import { verifyWebhook } from "@productcraft/core";

// A Fetch-style route handler (Next.js, Hono, Bun, Deno). With Express, use express.raw() and req.body.
export async function POST(req: Request): Promise<Response> {
  const event = await verifyWebhook({ payload: await req.text(), headers: req.headers, secret: process.env.WEBHOOK_SECRET! });
  console.log(event);
  return new Response(null, { status: 204 });
}
```

`payload` must be the raw body (string, `Buffer`, `Uint8Array` or `ArrayBuffer`). `headers` can be Node `IncomingHttpHeaders` or Fetch `Headers`. `secret` can be a list (rotation, or several endpoint secrets). Verifies Standard Webhooks (`webhook-id`, `webhook-timestamp`, `webhook-signature`, `whsec_` secrets) and the older `X-<Product>-Signature: t=…,v1=…` scheme, with a 300 s tolerance (`toleranceSeconds`). Returns the parsed JSON payload.

## For SDK authors

`new APIClient(options, defaultBaseUrl, { name, version })` is what generated product clients call: `request(spec, options)` returns an `APIPromise` (`.withResponse()`, `.asResponse()`), `list()` a `PagePromise` (`for await`, `.pages()`, `.toArray({ maxItems })`), plus `poll()`, `createAndPoll()` and `unwrapWebhook()`. `createOpenAPIClient<paths>(apiClient)` builds the typed `openapi-fetch` escape hatch (`.client`) over the same credential. The contract is section 4 of the [SDK standard](https://github.com/clauderanelagh/productcraft-node/blob/main/docs/sdk-standard.md).

The 0.x primitives stay exported: `PCAuth`, `PCClientConfig`, `PC_BASE_URL`, `PC_API_KEY_ENV`, `PC_AUTH_APP_ENV`, `readEnv`, `resolveAuth`, `authMiddleware` and `makeClient` (deprecated in favour of `APIClient` + `createOpenAPIClient`).

## License

[MIT](https://github.com/clauderanelagh/productcraft-node/blob/main/LICENSE).
