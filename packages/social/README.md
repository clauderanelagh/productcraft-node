# @productcraft/social

Node.js / TypeScript client for **ProductCraft Social**: communities, actors, posts and comments, ranked feeds, stories, the follow graph, direct conversations, notifications and moderation.

Every method, type, error class and mock is generated from the production OpenAPI spec. Coming from 1.0's raw `social.client.POST("/v1/…")` calls? `.client` still works unchanged; the [1.1 migration guide](https://github.com/clauderanelagh/productcraft-node/blob/main/docs/migrations/social-1.1.0.md) shows the resource method for every call shape.

## Install

```sh
npm install @productcraft/social
```

Node 20.3 or later, Bun, Deno and edge runtimes. Server-side only: your backend holds the workspace key (`pcft_live_…`) and calls Social on behalf of your users. Or install the umbrella package for every product: `npm install productcraft`.

## Quick start

```ts
import { Social } from "@productcraft/social";

// Reads PRODUCTCRAFT_API_KEY from the environment.
const social = new Social();

// Workspace-level: communities themselves (the workspace id is resolved from the key, or pass workspaceId).
const { id: communityId } = await social.communities.create({ display_name: "Founders Club", slug: "founders" });

// Community-level: bind the community once, then act as one of its actors.
const community = social.community(communityId);
const { actor } = await community.actors.create({ external_id: "user_123", display_name: "Ada" }); // upsert by your user id
const c = community.as(actor.id); // fills actor_id in every body or query that declares it

const post = await c.posts.create({ body: "Hello from the SDK" });
await c.posts.comments.create(post.id, { body: "First!" });
for await (const item of c.actors.feed.list(actor.id, { limit: 50 })) console.log(item);
```

## Two levels: workspace and community

| Calls on | Reach them through | Typical caller |
|---|---|---|
| Communities (create, list, analytics), moderation, workspace webhooks, stats | `social.communities.*`, `social.webhooks.*`, `social.stats` | Your admin tooling |
| Everything inside one community: actors, posts, comments, feeds, follows, conversations, notifications, community webhooks | `social.community(communityId).…` | Your product backend, per request |

`.as(actorId)` returns a copy of the community scope that fills `actor_id` (the acting user) wherever the API declares it. A call that passes its own `actor_id` wins:

```ts
import { Social } from "@productcraft/social";
declare const communityId: string, adaId: string, graceId: string, postId: string;
const social = new Social();

const asAda = social.community(communityId).as(adaId);
await asAda.follows.create({ dst_actor_id: graceId });                 // actor_id: adaId
await asAda.posts.reactions.create(postId, { type: "like", actor_id: graceId }); // explicit wins
const unread = await asAda.actors.notifications.unreadCount(adaId);
const dm = await asAda.conversations.create({ kind: "direct", recipient_actor_id: graceId });
await asAda.conversations.messages.create(dm.id, { body: "Hi Grace" });
```

Social's wire is snake_case and so are the request and response types: no re-casing. Positional arguments (`postId`, `actorId`) and client options are camelCase.

## Credentials

| Credential | Pass | Use it for |
|---|---|---|
| Workspace API key (`pcft_live_…`) | `apiKey`, or `PRODUCTCRAFT_API_KEY` in the environment | Your backend, for everything |
| Platform session (a signed-in person) | `auth: { type: "bearer", token }` plus `workspaceId` | Admin tooling acting as a console user |

An explicit `apiKey` or `auth` always wins over the environment. The environment fallback is server-only: never put a key in `NEXT_PUBLIC_*` or any variable a bundler inlines into browser code. A keyed client constructed in a browser throws unless you set `dangerouslyAllowBrowser: true`.

<!-- generated:start (scripts/gen-sdk.mjs; edits between the markers are overwritten) -->

## Resources

Full reference: [api.md](./api.md).

- `social.communities`: `actors.comments.list`, `actors.reactions.list`, `analytics`, `create`, `delete`, `list`, `moderation.actions.create`, `moderation.actors.shadowBan`, `moderation.actors.unshadowBan`, `moderation.audit.list`, `moderation.blockedTerms.create`, `moderation.blockedTerms.delete`, `moderation.blockedTerms.list`, `moderation.conversations.list`, `moderation.conversations.messages.list`, `moderation.flags.list`, `moderation.flags.resolve`, `moderation.shadowBanned.list`, `retrieve`, `update`, `webhooks.endpoints.create`, `webhooks.endpoints.delete`, `webhooks.endpoints.list`, `webhooks.endpoints.retrieve`, `webhooks.endpoints.rotateSecret`, `webhooks.endpoints.test`, `webhooks.endpoints.update`, `webhooks.eventTypes.list`, `webhooks.events.list`, `webhooks.events.replay`, `webhooks.events.retrieve`
- `social.community(…).actors`: `archived.list`, `assets.list`, `batch`, `blocks.list`, `bookmarks.list`, `byExternal.batch`, `byExternal.retrieve`, `closeFriends.list`, `counters`, `create`, `delete`, `dismissedSuggestions.list`, `drafts.list`, `feed.list`, `followRequests.list`, `followers.list`, `following.list`, `hashtagFollows.create`, `hashtagFollows.delete`, `hashtagFollows.list`, `hides.list`, `highlights.list`, `insights`, `list`, `mentions.list`, `mutedTerms.create`, `mutedTerms.delete`, `mutedTerms.list`, `mutes.list`, `notificationPrefs.list`, `notificationPrefs.update`, `notifications.list`, `notifications.markAllRead`, `notifications.unreadCount`, `notifications.update`, `postState`, `relationships.list`, `restricts.list`, `retrieve`, `scheduledPosts.list`, `storyTray.list`, `suggestedFollows.list`, `tagged.list`, `update`
- `social.community(…).assets`: `complete`, `create`, `delete`, `retrieve`
- `social.community(…).blocks`: `create`, `delete`
- `social.community(…).closeFriends`: `create`, `delete`
- `social.community(…).collections`: `create`, `delete`, `items.create`, `items.delete`, `items.list`, `items.update`, `list`, `retrieve`, `update`
- `social.community(…).connections`: `accept`, `create`, `delete`
- `social.community(…).conversations`: `create`, `delete`, `list`, `markRead`, `members.create`, `members.delete`, `members.update`, `messages.create`, `messages.delete`, `messages.list`, `messages.reactions.create`, `messages.reactions.delete`, `messages.reactions.list`, `messages.retrieve`, `messages.update`, `retrieve`, `unreadCount`, `update`
- `social.community(…).counters`: `list`
- `social.community(…).discoverFeed`: `list`
- `social.community(…).dismissedSuggestions`: `create`, `delete`
- `social.community(…).flags`: `create`, `list`
- `social.community(…).followRequests`: `approve`, `delete`
- `social.community(…).follows`: `batch`, `create`, `delete`
- `social.community(…).hashtags`: `list`, `posts.list`, `retrieve`
- `social.community(…).hides`: `create`, `delete`
- `social.community(…).lists`: `create`, `delete`, `feed.list`, `list`, `members.create`, `members.delete`, `members.list`, `retrieve`, `update`
- `social.community(…).mutes`: `create`, `delete`
- `social.community(…).posts`: `bookmark`, `comments.approve`, `comments.create`, `comments.delete`, `comments.list`, `comments.pin`, `comments.reactions.create`, `comments.reactions.delete`, `comments.reactions.list`, `comments.retrieve`, `comments.unpin`, `comments.update`, `create`, `delete`, `insights`, `list`, `pollResults`, `quotes.list`, `reactions.create`, `reactions.delete`, `reactions.list`, `recordImpressions`, `recordView`, `repost`, `reposts.list`, `retrieve`, `revisions.list`, `tags.approve`, `tags.delete`, `unbookmark`, `unrepost`, `update`, `viewers.list`, `voters.list`, `votes.create`, `votes.delete`, `votes.retrieve`
- `social.community(…).restricts`: `create`, `delete`
- `social.community(…).search`: `actors.list`, `hashtags.list`, `posts.list`
- `social.community(…).webhooks`: `endpoints.create`, `endpoints.delete`, `endpoints.list`, `endpoints.retrieve`, `endpoints.rotateSecret`, `endpoints.test`, `endpoints.update`, `eventTypes.list`, `events.list`, `events.replay`, `events.retrieve`
- `social.stats`: `retrieve`
- `social.webhooks`: `endpoints.create`, `endpoints.delete`, `endpoints.list`, `endpoints.retrieve`, `endpoints.rotateSecret`, `endpoints.test`, `endpoints.update`, `eventTypes.list`, `events.list`, `events.replay`, `events.retrieve`

## Pagination

List methods return a `PagePromise`: `for await` walks every item across pages, `await` gives one page.

```ts
import { Social } from "@productcraft/social";
const social = new Social({ apiKey: process.env.PRODUCTCRAFT_API_KEY });
for await (const item of social.communities.list({ limit: 50 })) console.log(item);
const page = await social.communities.list();
if (page.hasNextPage()) await page.getNextPage();
const all = await social.communities.list().toArray({ maxItems: 500 });
```

## Errors

Every failure is a class you can catch. `APIError` carries `status`, `code`, `message`, `errors[]`, `requestId` and `docUrl`.

```ts
import { Social, NotFoundError, RateLimitError, APIError } from "@productcraft/social";
const social = new Social();
try {
  await social.communities.retrieve("00000000-0000-0000-0000-000000000000");
} catch (err) {
  if (err instanceof NotFoundError) console.log(err.code, err.requestId, err.docUrl);
  else if (err instanceof RateLimitError) console.log(err.retryAfter);
  else if (err instanceof APIError) console.log(err.status, err.errors);
  else throw err;
}
```

## Retries and timeouts

Network errors, 408, 429, 5xx and `409 IDEMPOTENCY_IN_PROGRESS` are retried twice by default with exponential backoff and jitter, honouring `Retry-After` up to 60 s. A POST or PATCH without an idempotency key is never retried. Each attempt times out after 60 s, so the worst case with defaults is about 3 minutes; pass `signal: AbortSignal.timeout(ms)` for an overall deadline.

```ts
import { Social } from "@productcraft/social";
const social = new Social({ maxRetries: 3, timeout: 20_000 });
await social.communities.list({}, { maxRetries: 0, signal: AbortSignal.timeout(5_000) });
```

## Idempotency

Writes that support it send an `Idempotency-Key` automatically and reuse it on every retry. Pass your own to make a retry across processes safe. If the API's idempotency store is unavailable it runs the request without it (fail-open), so a retry during that window can execute twice.

```ts
import { Social } from "@productcraft/social";
const social = new Social({ apiKey: process.env.PRODUCTCRAFT_API_KEY });
const community = await social.communities.create({ display_name: "My Product Community", slug: "my-product-community" }, { idempotencyKey: "order-1234" });
```

## Webhooks

`social.webhooks.unwrap()` verifies the signature against the **raw** body and returns a typed `Social.UnwrapWebhookEvent`. The secret comes from `{ secret }`, the client's `webhookSecret`, or `PRODUCTCRAFT_SOCIAL_WEBHOOK_SECRET`.

Next.js route handler:

```ts
import { Social } from "@productcraft/social";
const social = new Social();
export async function POST(req: Request) {
  const event = await social.webhooks.unwrap({ payload: await req.text(), headers: req.headers });
  switch (event.type) {
    case "actor.updated":
      console.log(event.data);
      break;
    default:
      break; // UnknownWebhookEvent: types added later
  }
  return new Response(null, { status: 204 });
}
```

Express (keep the body raw):

```ts
import express from "express";
import { Social } from "@productcraft/social";
const social = new Social();
const app = express();
app.post("/webhooks", express.raw({ type: "application/json" }), async (req, res) => {
  const event = await social.webhooks.unwrap({ payload: req.body, headers: req.headers });
  console.log(event.type);
  res.sendStatus(204);
});
```

Hono:

```ts
import { Hono } from "hono";
import { Social } from "@productcraft/social";
const social = new Social();
const app = new Hono();
app.post("/webhooks", async (c) => {
  const event = await social.webhooks.unwrap({ payload: await c.req.text(), headers: c.req.raw.headers });
  console.log(event.type);
  return c.body(null, 204);
});
```

Testing a handler: `webhooks.sign()` signs an event the way ProductCraft does, so a test needs no live delivery and no hand-rolled HMAC.

```ts
import { Social } from "@productcraft/social";
const social = new Social({ webhookSecret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw" });
const { payload, headers } = await social.webhooks.sign({ payload: { id: "evt_test_1", type: "actor.updated", created_at: new Date().toISOString(), data: {} } });
const event = await social.webhooks.unwrap({ payload, headers });
console.log(event.type);
```

## Raw responses

Every returned object has a non-enumerable `lastResponse` (`requestId`, `status`, `headers`). `.withResponse()` adds the `Response` and parsed rate-limit headers.

```ts
import { Social } from "@productcraft/social";
const social = new Social({ apiKey: process.env.PRODUCTCRAFT_API_KEY });
const id = "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b";
const obj = await social.communities.retrieve(id);
console.log(obj.lastResponse.requestId);
const { data, response, requestId, rateLimit } = await social.communities.retrieve(id).withResponse();
console.log(data, response.status, requestId, rateLimit?.remaining);
```

## Testing

`@productcraft/social/testing` exports `createMockFetch()`, a `fetch` that answers every operation with its spec example. Override one operation by name.

```ts
import { Social } from "@productcraft/social";
import { createMockFetch } from "@productcraft/social/testing";
const fetch = createMockFetch();
const social = new Social({ apiKey: "test", workspaceId: "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b", fetch });
await social.communities.list();
console.log(fetch.calls.length);
```

## Escape hatch

`.client` is the typed `openapi-fetch` client over the same credential and base URL (no retries). Use it for anything the resource methods do not cover.

```ts
import { Social } from "@productcraft/social";
const social = new Social({ apiKey: process.env.PRODUCTCRAFT_API_KEY });
const { data, error } = await social.client.GET("/v1/workspaces/{workspace_id}/communities", { params: { path: { workspace_id: "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b" } } });
console.log(data, error);
```

<!-- generated:end -->

## License

[MIT](https://github.com/clauderanelagh/productcraft-node/blob/main/LICENSE).
