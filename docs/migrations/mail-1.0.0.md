# Migrating to @productcraft/mail 1.0

`@productcraft/mail` 1.0 is generated from the Mail OpenAPI spec onto the shared runtime in `@productcraft/core`: resource methods (`mail.emails.send()`, `mail.templates.send()`), auto-pagination, domain polling, retries with automatic idempotency keys, typed error classes and webhook verification.

**Nothing you call today breaks.** `mail.client` (the typed `openapi-fetch` client) is still there with the same `paths` types, so every 0.x call site keeps compiling and running. Move call sites over at your own pace; this guide shows the 1.0 shape for every call our docs and consumers make. Pinned on `^0.x`? You stay on 0.x until you change the range (WriteWave pins `^0.1.1` and stays there for now).

Node 20.3 or later is required (Node 18 is end-of-life).

<!-- snippet-preamble: import { Mail, NotFoundError, APIError } from "@productcraft/mail"; const mail = new Mail(); -->

## Constructing the client

```ts before
const mail = new Mail({ auth: { type: "apiKey", key: process.env.PRODUCTCRAFT_API_KEY! } });
const workspace_id = process.env.WORKSPACE_ID!; // passed on every call
```

```ts
const client = new Mail({ apiKey: process.env.PRODUCTCRAFT_API_KEY, workspaceId: process.env.WORKSPACE_ID });
```

- `apiKey` is shorthand for `auth: { type: "apiKey", key }`; `auth` still works (bearer and cookie credentials too). Both fall back to `PRODUCTCRAFT_API_KEY`.
- `workspaceId` is bound once on the client (or `PRODUCTCRAFT_WORKSPACE_ID`). With a workspace API key you can leave it out: the client looks it up once per process. Override it per call with `{ workspaceId }` in the request options.
- New options: `maxRetries` (default 2), `timeout` (default 60 s per attempt), `fetch`, `defaultHeaders`, `logLevel`, `logger`, `webhookSecret`.

## Send a template

```ts before
const { data, error } = await mail.client.POST("/v1/workspaces/{workspace_id}/templates/{name}/send", {
  params: {
    path: { workspace_id: "<ws>", name: "welcome" },
    header: { "Idempotency-Key": "welcome-2026-05-22-ada" },
  },
  body: { from: "hello@yourbrand.com", to: "ada@example.com", subject: "Welcome", data: { name: "Ada" } },
});
if (error) throw error;
```

```ts
const accepted = await mail.templates.send("welcome", {
  from: "Acme <hello@mail.acme.com>",
  to: "success@simulator.amazonses.com",
  data: { name: "Ada" },
});
```

The method resolves to the accepted send and throws on failure. An `Idempotency-Key` is generated automatically and reused on every retry, so a retried send never mails twice; pass `{ idempotencyKey: "welcome-2026-05-22-ada" }` as the last argument to choose your own (a replay is answered with `Idempotent-Replay: true` for 24 h). `data` is `Record<string, unknown>`; its keys are your template variables and are sent exactly as written.

## Send raw HTML (new)

There was no 0.x call for this: `POST /emails` is new in Mail (Resend-shaped).

```ts
const email = await mail.emails.send({
  from: "Acme <hello@mail.acme.com>",
  to: ["success@simulator.amazonses.com"],
  subject: "Your receipt",
  html: "<p>Thanks for your order.</p>",
  tags: [{ name: "kind", value: "receipt" }],
});
const status = await mail.emails.retrieve(email.id);
```

`emails` is the call you made (send, batch, list, retrieve, metrics); `messages` is the per-recipient delivery log (below).

## Domains

```ts before
const { data: domains } = await mail.client.GET("/v1/workspaces/{workspace_id}/domains", {
  params: { path: { workspace_id: "<workspaceId>" } },
});
const { data: verified } = await mail.client.POST("/v1/workspaces/{workspace_id}/domains/{domain_id}/verify", {
  params: { path: { workspace_id: "<ws>", domain_id: "<id>" } },
});
```

```ts
for await (const domain of mail.domains.list()) console.log(domain.name, domain.status);

const domainId = "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b";
await mail.domains.verify(domainId);
// Wait until verification settles (active or disabled), honouring Retry-After:
const domain = await mail.domains.poll(domainId, { intervalMs: 10_000, timeoutMs: 600_000 });
console.log(domain.status);
```

## Lint a template

```ts before
const { data } = await mail.client.POST("/v1/workspaces/{workspace_id}/templates/lint", {
  params: { path: { workspace_id: "<ws>" } },
  body: { subject: "Welcome!", body_html: "<h1>Hi {{name}}</h1><p>CLICK HERE!</p>" },
});
// data.score, data.findings
```

```ts
const lint = await mail.templates.lint({ subject: "Welcome!", body_html: "<h1>Hi {{name}}</h1><p>CLICK HERE!</p>" });
console.log(lint.score, lint.findings);
```

## Suppression list

```ts before
await mail.client.POST("/v1/workspaces/{workspace_id}/suppression", {
  params: { path: { workspace_id: "<ws>" } },
  body: { email: "userwhowantsout@example.com", reason: "unsubscribed via preferences page" },
});
```

```ts
await mail.suppression.create({ email: "userwhowantsout@example.com", reason: "unsubscribed via preferences page" });
```

## The delivery log (messages)

```ts before
const { data } = await mail.client.GET("/v1/workspaces/{workspace_id}/messages", {
  params: { path: { workspace_id: "<ws>" }, query: { template: "welcome", status: ["sent"], limit: 20 } },
});
```

```ts
const page = await mail.messages.list({ template: "welcome", status: ["sent"], limit: 20 }); // one page: page.data, page.has_more
for await (const message of mail.messages.list({ template: "welcome", status: ["delivered"] })) {
  console.log(message.id, message.status); // every message, across pages
}
console.log(page.data.length);

// CSV export, raw MIME and attachments resolve to the raw Response:
const csv = await (await mail.messages.export({ template: "welcome" })).text();
console.log(csv.length);

// GDPR erasure of one recipient's log (not `delete`):
await mail.messages.erase({ recipient: "ada@example.com" });
```

## Errors

```ts before
const { data, error } = await mail.client.GET("/v1/workspaces/{workspace_id}/domains/{domain_id}", {
  params: { path: { workspace_id: "<ws>", domain_id: "<id>" } },
});
if (error) console.error(error);
```

```ts
try {
  await mail.domains.retrieve("00000000-0000-0000-0000-000000000000");
} catch (err) {
  if (err instanceof NotFoundError) console.log(err.code, err.requestId, err.docUrl);
  else if (err instanceof APIError) console.log(err.status, err.code, err.errors);
  else throw err;
}
```

Every class (`BadRequestError`, `PermissionDeniedError`, `NotFoundError`, `ConflictError`, `UnprocessableEntityError`, `RateLimitError`, `APIConnectionError`, `APITimeoutError`, …) is exported from `@productcraft/mail`. A send from a domain that is not an active sending domain is a 422 with `code: "from_domain_not_verified"`.

## Webhooks

The default and per-domain webhook routes (`/webhooks/default`, `/webhooks/domains/{domain_id}`) are deprecated and are not SDK methods; reach them through `mail.client` until you move. Endpoints under `/webhooks/endpoints` receive every event they subscribe to:

```ts before
await mail.client.PUT("/v1/workspaces/{workspace_id}/webhooks/default", {
  params: { path: { workspace_id: "<ws>" } },
  body: { url: "https://yourapp.com/hooks/mail", events: ["message.delivered"] },
});
```

```ts
const endpoint = await mail.webhooks.endpoints.create({ url: "https://yourapp.com/hooks/mail", event_types: ["email.delivered", "email.bounced"] });
console.log(endpoint.signing_secret); // shown once: store it as PRODUCTCRAFT_MAIL_WEBHOOK_SECRET
```

Verify deliveries against the raw body. `unwrap` accepts several secrets (the default, per-domain and endpoint secrets, or old and new during a rotation) and both the Standard Webhooks headers and the older `X-Mail-Signature` scheme:

```ts
export async function POST(req: Request) {
  const event = await mail.webhooks.unwrap({
    payload: await req.text(),
    headers: req.headers,
    secret: [process.env.MAIL_ENDPOINT_SECRET!, process.env.MAIL_DEFAULT_WEBHOOK_SECRET!],
  });
  if (event.type === "email.bounced") console.log(event.data);
  return new Response(null, { status: 204 });
}
```

## The umbrella package

`productcraft` exposes the same client as `pc.mail`, so everything above applies to `pc.mail.templates.send(…)` as well.
