# Migrating to @productcraft/waitlist 1.0

`@productcraft/waitlist` 1.0 is generated from the Waitlist OpenAPI spec onto the shared runtime in `@productcraft/core`: resource methods (`waitlist.lists.create()`, `waitlist.lists.entries.list()`), a keyless `waitlist.public({ workspace, waitlist })` scope for signup forms, auto-pagination, retries with automatic idempotency keys, typed error classes and webhook verification.

**Nothing you call today breaks.** `waitlist.client` (the typed `openapi-fetch` client) is still there with the same `paths` types, so every 0.x call site keeps compiling and running. Move call sites over at your own pace; this guide shows the 1.0 shape for every call our docs and consumers make. Pinned on `^0.x`? You stay on 0.x until you change the range.

Node 20.3 or later is required (Node 18 is end-of-life).

<!-- snippet-preamble: import { Waitlist, NotFoundError, BadRequestError, APIError } from "@productcraft/waitlist"; const waitlist = new Waitlist(); const waitlistId = "3f0c1a2b-4c5d-4e6f-8a9b-0c1d2e3f4a5b"; -->

## Constructing the client

```ts before
const waitlist = new Waitlist({ auth: { type: "apiKey", key: process.env.PRODUCTCRAFT_API_KEY! } });
const workspace_id = process.env.WORKSPACE_ID!; // passed on every call
```

```ts
const admin = new Waitlist({ apiKey: process.env.PRODUCTCRAFT_API_KEY, workspaceId: process.env.WORKSPACE_ID });
```

- `apiKey` is shorthand for `auth: { type: "apiKey", key }`; `auth` still works (bearer and cookie credentials too). Both fall back to `PRODUCTCRAFT_API_KEY`.
- `workspaceId` is bound once on the client (or `PRODUCTCRAFT_WORKSPACE_ID`). With a workspace API key you can leave it out: the client looks it up once per process. Override it per call with `{ workspaceId }` in the request options.
- New options: `maxRetries` (default 2), `timeout` (default 60 s per attempt), `fetch`, `defaultHeaders`, `logLevel`, `logger`, `webhookSecret`, `dangerouslyAllowBrowser`.
- **Browsers:** a client constructed with a workspace key in a browser now throws a `ConfigurationError` unless you pass `dangerouslyAllowBrowser: true` (anyone who loads the page can read the key). The keyless `new Waitlist()` is unaffected.

## Accept a signup from a public form

```ts before
const { data, error } = await waitlist.client.POST("/v1/waitlists/{workspace_slug}/{waitlist_slug}/entries", {
  params: { path: { workspace_slug: "acme", waitlist_slug: "acme-pro" } },
  body: {
    email: "ada@example.com",
    name: "Ada Lovelace",
    metadata: { company: "Acme Industries", role: "engineer" },
    referral_code: "C67AB5HS",
  },
});
if (error) throw new Error(`Sign-up refused: ${JSON.stringify(error)}`);
```

```ts
const form = new Waitlist().public({ workspace: "acme", waitlist: "acme-pro" });
const entry = await form.entries.create({
  email: "ada@example.com",
  name: "Ada Lovelace",
  metadata: { company: "Acme Industries", role: "engineer" },
  referral_code: "C67AB5HS",
});
console.log(entry.id, entry.position, entry.referral_code);
```

- `public({ workspace, waitlist })` binds both slugs by name, so they cannot be swapped. It needs no key, never sends one (even from a keyed client) and is safe in a browser bundle.
- The method resolves to the created entry and throws on failure: a duplicate email is a `ConflictError` (409), a paused, closed or full waitlist an `UnprocessableEntityError` (422), a failed validation or spam check a `BadRequestError` (400).
- An `Idempotency-Key` is generated and reused on every retry, so a retried submit never signs the same person up twice.

The public info and leaderboard reads moved the same way:

```ts before
await waitlist.client.GET("/v1/waitlists/{workspace_slug}/{waitlist_slug}", { params: { path: { workspace_slug: "acme", waitlist_slug: "acme-pro" } } });
await waitlist.client.GET("/v1/waitlists/{workspace_slug}/{waitlist_slug}/leaderboard", { params: { path: { workspace_slug: "acme", waitlist_slug: "acme-pro" } } });
```

```ts
const form = new Waitlist().public({ workspace: "acme", waitlist: "acme-pro" });
const info = await form.info.retrieve();
const { data: top } = await form.leaderboard.list();
console.log(info.display_name, top.length);
```

`leaderboard.list()` calls `GET …/leaderboard/top` (the same rows in a `{ data }` envelope). The bare `GET …/leaderboard` array is deprecated and has no SDK method.

## Create a waitlist

```ts before
const { data } = await waitlist.client.POST("/v1/workspaces/{workspace_id}/waitlists", {
  params: { path: { workspace_id: "<workspace_id>" } },
  body: {
    slug: "acme-pro",
    display_name: "Acme Pro early access",
    description: "Sign up to be among the first to try Acme Pro.",
  },
});
```

```ts
const list = await waitlist.lists.create({
  slug: "acme-pro",
  display_name: "Acme Pro early access",
  description: "Sign up to be among the first to try Acme Pro.",
  status: "active", // accept signups straight away; without it the list starts as a draft
});
await waitlist.lists.updateStatus(list.id, { status: "paused" });
```

The root namespace is `lists` (not `waitlists`), so calls read `waitlist.lists.*`. `PATCH /waitlists/{id}/status` is `lists.updateStatus(id, { status })`; `retrieve`, `update`, `delete` and `list` complete the set.

## List and count entries

```ts before
const { data, error } = await admin.client.GET("/v1/workspaces/{workspace_id}/waitlists/{waitlist_id}/entries", {
  params: {
    path: { workspace_id: "<workspace_id>", waitlist_id: "<waitlist_id>" },
    query: { limit: 5 },
  },
});
```

```ts
// Every entry: pages are fetched as you iterate.
for await (const entry of waitlist.lists.entries.list(waitlistId, { status: "pending" })) {
  console.log(entry.email, entry.position);
}

// Just the first page (data, has_more, next_cursor), like the 0.x call.
const page = await waitlist.lists.entries.list(waitlistId, { limit: 5 });
console.log(page.data, page.has_more, page.next_cursor);

const { count } = await waitlist.lists.entries.count(waitlistId);
```

## Approve, reject and invite

```ts before
const { data } = await waitlist.client.POST("/v1/workspaces/{workspace_id}/waitlists/{waitlist_id}/entries/bulk", {
  params: { path: { workspace_id: "<workspace_id>", waitlist_id: "<waitlist_id>" } },
  body: { ids: ["150489b4-...", "72d214cd-..."], action: "approve" },
});
```

```ts
const result = await waitlist.lists.entries.bulk(waitlistId, {
  ids: ["150489b4-6a3c-4c1e-9d1a-2f3b4c5d6e7f", "72d214cd-1b2c-4d3e-8f4a-5b6c7d8e9f0a"],
  action: "approve",
});
const invite = await waitlist.lists.entries.inviteToApp(waitlistId, "150489b4-6a3c-4c1e-9d1a-2f3b4c5d6e7f", { app_slug: "acme-pro" });
console.log(result, invite.invite_url);
```

## Variants

```ts before
const { data } = await waitlist.client.POST("/v1/workspaces/{workspace_id}/waitlists/{waitlist_id}/variants", {
  params: { path: { workspace_id: "<workspace_id>", waitlist_id: "<waitlist_id>" } },
  body: { kind: "ab", locale: "en", copy: { display_name: "Built by founders, for founders." }, weight: 50 },
});
```

```ts
const variant = await waitlist.lists.variants.create(waitlistId, {
  kind: "ab",
  locale: "en",
  copy: { display_name: "Built by founders, for founders." },
  weight: 50,
});
for await (const v of waitlist.lists.variants.list(waitlistId)) console.log(v.id, v.weight);
await waitlist.lists.variants.delete(waitlistId, variant.id);
```

## Export and analytics

```ts before
await waitlist.client.GET("/v1/workspaces/{workspace_id}/waitlists/{waitlist_id}/entries/export.csv", { params: { path: { workspace_id: "<ws>", waitlist_id: "<id>" } }, parseAs: "text" });
await waitlist.client.GET("/v1/workspaces/{workspace_id}/waitlists/{waitlist_id}/analytics/timeline", { params: { path: { workspace_id: "<ws>", waitlist_id: "<id>" }, query: { since: "2026-05-01T00:00:00Z" } } });
```

```ts
const csv = await waitlist.lists.entries.export(waitlistId); // the raw Response
console.log(await csv.text());

const analytics = await waitlist.lists.analytics.retrieve(waitlistId);
const timeline = await waitlist.lists.analytics.timeline(waitlistId, { since: "2026-05-01T00:00:00Z", until: "2026-06-01T00:00:00Z" });
console.log(analytics, timeline);
```

## Errors

```ts before
const { data, error, response } = await waitlist.client.GET("/v1/workspaces/{workspace_id}/waitlists/{id}", {
  params: { path: { workspace_id: "<ws>", id: "<id>" } },
});
if (response.status === 404) console.log("gone", error);
```

```ts
try {
  await waitlist.lists.retrieve(waitlistId);
} catch (err) {
  if (err instanceof NotFoundError) console.log(err.requestId, err.docUrl);
  else if (err instanceof BadRequestError) err.errors.forEach((e) => console.log(e.param, e.message));
  else if (err instanceof APIError) console.log(err.status, err.code);
  else throw err;
}
```

Every result carries `lastResponse` (`status`, `headers`, `requestId`), and `.withResponse()` returns `{ data, response, requestId }` when you need the raw response.

## Webhooks

The workspace webhook routes `/v1/workspaces/{workspace_id}/webhooks` and `/webhooks/{id}` are deprecated and are not SDK methods; reach them through `waitlist.client` until you move. Endpoints under `/webhooks/endpoints` replace them:

```ts before
await waitlist.client.POST("/v1/workspaces/{workspace_id}/webhooks", {
  params: { path: { workspace_id: "<ws>" } },
  body: { url: "https://yourapp.com/hooks/waitlist", events: ["entry.created"] },
});
```

```ts
const endpoint = await waitlist.webhooks.endpoints.create({ url: "https://yourapp.com/hooks/waitlist", event_types: ["entry.created", "entry.approved"] });
console.log(endpoint.signing_secret); // shown once: store it as PRODUCTCRAFT_WAITLIST_WEBHOOK_SECRET
```

Verify deliveries against the raw body. `unwrap` accepts the Standard Webhooks headers and the older `X-Waitlist-Signature` scheme, and several secrets during a rotation:

```ts
export async function POST(req: Request) {
  const event = await waitlist.webhooks.unwrap({ payload: await req.text(), headers: req.headers });
  if (event.type === "entry.created") console.log(event.data);
  return new Response(null, { status: 204 });
}
```

## The umbrella package

`productcraft` exposes the same client as `pc.waitlist`, so everything above applies to `pc.waitlist.lists.create(…)` as well.
