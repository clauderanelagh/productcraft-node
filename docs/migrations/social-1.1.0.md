# Moving to the @productcraft/social 1.1 resource methods

`@productcraft/social` 1.1 is generated from the Social OpenAPI spec onto the shared runtime in `@productcraft/core`: resource methods (`social.community(id).posts.create()`), a community scope with `.as(actorId)`, auto-pagination, retries with automatic idempotency keys and typed error classes.

**1.1 is additive. Nothing you call today breaks.** `social.client` (the typed `openapi-fetch` client) is still there, typed by the same `paths`, so every 1.0 call site keeps compiling and running. Move call sites over at your own pace; this guide shows the 1.1 shape for every call our docs make. Pinned on `^0.7` (conquer, WriteWave)? You stay there until you change the range; read the 1.0 notes in the package README first (path parameters became snake_case).

Node 20.3 or later is required (Node 18 is end-of-life).

<!-- snippet-preamble: import { Social, NotFoundError, BadRequestError, APIError } from "@productcraft/social"; declare const communityId: string, actorId: string, otherActorId: string, postId: string, commentId: string, conversationId: string, messageId: string, listId: string, memberActorId: string, externalId: string; const social = new Social(); -->

## The two ideas

1. **Bind the community once.** `social.community(communityId)` returns a scope; every `/v1/communities/{community_id}/…` route hangs off it. Workspace routes (`/v1/workspaces/{workspace_id}/…`: communities, moderation, workspace webhooks, stats) stay on `social` itself, and the client fills `workspace_id` (pass `workspaceId`, set `PRODUCTCRAFT_WORKSPACE_ID`, or let a workspace key resolve it once per process).
2. **Act as a user with `.as(actorId)`.** It returns a copy of the scope that fills `actor_id` in every body or query that declares it. A call that passes its own `actor_id` wins. Positional arguments are the remaining path parameters, outermost first.

```ts before
await social.client.POST("/v1/communities/{community_id}/posts", {
  params: { path: { community_id: communityId } },
  body: { actor_id: actorId, body: "Hello" },
});
```

```ts
const c = social.community(communityId).as(actorId);
const post = await c.posts.create({ body: "Hello" });
console.log(post.id, post.lastResponse.requestId);
```

Methods resolve to the response body (no `{ data, error }` to unpack) and throw on a non-2xx status. Writes that the API marks idempotent (creates, sends) carry an automatic `Idempotency-Key`, reused on retries; pass `{ idempotencyKey }` as the last argument to choose your own.

## Constructing the client

```ts before
const social = new Social({ auth: { type: "apiKey", key: process.env.PCFT_KEY! } });
```

```ts
const s = new Social({ apiKey: process.env.PRODUCTCRAFT_API_KEY, workspaceId: process.env.PRODUCTCRAFT_WORKSPACE_ID });
void s;
```

`auth` still works (bearer and cookie credentials too). New options: `workspaceId`, `maxRetries` (default 2), `timeout` (default 60 s per attempt), `defaultHeaders`, `logLevel`, `logger`, `dangerouslyAllowBrowser`. A client constructed with a key in a browser now throws a `ConfigurationError` unless you pass `dangerouslyAllowBrowser: true` (Social is server-side; keep the key on your backend).

## Communities (workspace level)

```ts before
const { data } = await social.client.POST("/v1/workspaces/{workspace_id}/communities", {
  params: { path: { workspace_id: workspaceId } },
  body: { display_name: "Founders Club", slug: "founders" },
});
```

```ts
const community = await social.communities.create({ display_name: "Founders Club", slug: "founders" });
for await (const cm of social.communities.list({ limit: 50 })) console.log(cm.slug);
```

## Actors

```ts before
await social.client.POST("/v1/communities/{community_id}/actors", { params: { path: { community_id } }, body: { external_id: "user_123", display_name: "Ada" } });
await social.client.GET("/v1/communities/{community_id}/actors/by-external/{external_id}", { params: { path: { community_id, external_id } } });
await social.client.PATCH("/v1/communities/{community_id}/actors/{actor_id}", { params: { path: { community_id, actor_id } }, body: { display_name: "Ada L." } });
await social.client.GET("/v1/communities/{community_id}/actors", { params: { path: { community_id }, query: { limit: 20 } } });
```

```ts
const community = social.community(communityId);
const { actor, created } = await community.actors.create({ external_id: "user_123", display_name: "Ada" }); // upsert
const same = await community.actors.byExternal.retrieve(externalId);
await community.actors.update(actor.id, { display_name: "Ada L." });
for await (const a of community.actors.list({ limit: 20 })) console.log(a.id, a.display_name);
void created; void same;
```

## Posts

```ts before
await social.client.POST("/v1/communities/{community_id}/posts", { params: { path: { community_id } }, body: { actor_id, body: "Hello" } });
await social.client.GET("/v1/communities/{community_id}/posts", { params: { path: { community_id }, query: { limit: 20 } } });
await social.client.PATCH("/v1/communities/{community_id}/posts/{post_id}", { params: { path: { community_id, post_id } }, body: { body: "Edited" } });
await social.client.DELETE("/v1/communities/{community_id}/posts/{post_id}", { params: { path: { community_id, post_id } } });
await social.client.POST("/v1/communities/{community_id}/posts/{post_id}/bookmark", { params: { path: { community_id, post_id } }, body: { actor_id } });
await social.client.POST("/v1/communities/{community_id}/posts/{post_id}/repost", { params: { path: { community_id, post_id } }, body: { actor_id } });
await social.client.POST("/v1/communities/{community_id}/posts/impressions", { params: { path: { community_id } }, body: { actor_id, post_ids } });
await social.client.POST("/v1/communities/{community_id}/posts/{post_id}/comments/{comment_id}/reactions", { params: { path: { community_id, post_id, comment_id } }, body: { actor_id, type: "like" } });
```

```ts
const c = social.community(communityId).as(actorId);
const post = await c.posts.create({ body: "Hello" });
const page = await c.posts.list({ limit: 20 });               // one page: page.data, page.has_more
for await (const p of c.posts.list({ limit: 20 })) console.log(p.id); // every page
await c.posts.update(post.id, { body: "Edited" });
await c.posts.bookmark(post.id);
await c.posts.repost(post.id);
await c.posts.recordImpressions({ post_ids: [post.id] });
await c.posts.comments.create(post.id, { body: "First!" });
await c.posts.comments.reactions.create(postId, commentId, { type: "like" });
await c.posts.delete(post.id);
void page;
```

## Feeds, search and suggestions

```ts before
await social.client.GET("/v1/communities/{community_id}/search/posts", { params: { path: { community_id }, query: { q: "launch", actor_id } } });
await social.client.GET("/v1/communities/{community_id}/search/actors", { params: { path: { community_id }, query: { q: "ada" } } });
await social.client.GET("/v1/communities/{community_id}/actors/{actor_id}/suggested-follows", { params: { path: { community_id, actor_id } } });
await social.client.GET("/v1/communities/{community_id}/actors/{actor_id}/scheduled-posts", { params: { path: { community_id, actor_id } } });
```

```ts
const c = social.community(communityId).as(actorId);
for await (const hit of c.search.posts.list({ q: "launch" })) console.log(hit.rank, hit.post.id);
for await (const hit of c.search.actors.list({ q: "ada" })) console.log(hit.rank, hit.actor.display_name);
for await (const s of c.actors.suggestedFollows.list(actorId)) console.log(s);
for await (const p of c.actors.scheduledPosts.list(actorId)) console.log(p.id);
for await (const item of c.actors.feed.list(actorId, { limit: 50 })) console.log(item);
```

## Muted terms, hashtag follows, notification preferences

```ts before
await social.client.POST("/v1/communities/{community_id}/actors/{actor_id}/muted-terms", { params: { path: { community_id, actor_id } }, body: { term: "spoilers" } });
await social.client.GET("/v1/communities/{community_id}/actors/{actor_id}/muted-terms", { params: { path: { community_id, actor_id } } });
await social.client.DELETE("/v1/communities/{community_id}/actors/{actor_id}/muted-terms/{term}", { params: { path: { community_id, actor_id, term } } });
await social.client.POST("/v1/communities/{community_id}/actors/{actor_id}/hashtag-follows", { params: { path: { community_id, actor_id } }, body: { tag: "launch" } });
await social.client.GET("/v1/communities/{community_id}/actors/{actor_id}/notification-prefs", { params: { path: { community_id, actor_id } } });
```

```ts
const community = social.community(communityId);
await community.actors.mutedTerms.create(actorId, { term: "spoilers" });
for await (const t of community.actors.mutedTerms.list(actorId)) console.log(t.term);
await community.actors.mutedTerms.delete(actorId, "spoilers");
await community.actors.hashtagFollows.create(actorId, { tag: "launch" });
const prefs = await community.actors.notificationPrefs.list(actorId);
void prefs;
```

## Lists

```ts before
await social.client.POST("/v1/communities/{community_id}/lists", { params: { path: { community_id } }, body: { actor_id, name: "Close team" } });
await social.client.POST("/v1/communities/{community_id}/lists/{list_id}/members", { params: { path: { community_id, list_id } }, body: { actor_id, member_actor_id } });
await social.client.GET("/v1/communities/{community_id}/lists/{list_id}/members", { params: { path: { community_id, list_id } } });
await social.client.GET("/v1/communities/{community_id}/lists/{list_id}/feed", { params: { path: { community_id, list_id }, query: { actor_id } } });
await social.client.DELETE("/v1/communities/{community_id}/lists/{list_id}/members/{member_actor_id}", { params: { path: { community_id, list_id, member_actor_id }, query: { actor_id } } });
```

```ts
const c = social.community(communityId).as(actorId);
const list = await c.lists.create({ name: "Close team" });
await c.lists.members.create(list.id, { member_actor_id: memberActorId });
for await (const m of c.lists.members.list(list.id)) console.log(m);
for await (const item of c.lists.feed.list(list.id)) console.log(item);
await c.lists.members.delete(list.id, memberActorId);
```

`.as(actorId)` fills `actor_id` as the acting owner. The deprecated `caller_actor_id` shape of `lists.members.create` (where `actor_id` meant the member) does not mix with `.as()`: send `member_actor_id`.

## Conversations

```ts before
await social.client.POST("/v1/communities/{community_id}/conversations", { params: { path: { community_id } }, body: { actor_id, kind: "direct", recipient_actor_id } });
await social.client.POST("/v1/communities/{community_id}/conversations/{conversation_id}/messages", { params: { path: { community_id, conversation_id } }, body: { actor_id, body: "Hi" } });
await social.client.GET("/v1/communities/{community_id}/conversations/{conversation_id}/messages", { params: { path: { community_id, conversation_id }, query: { actor_id } } });
await social.client.PATCH("/v1/communities/{community_id}/conversations/{conversation_id}/messages/{message_id}", { params: { path: { community_id, conversation_id, message_id } }, body: { actor_id, body: "Hi!" } });
await social.client.DELETE("/v1/communities/{community_id}/conversations/{conversation_id}/messages/{message_id}", { params: { path: { community_id, conversation_id, message_id }, query: { actor_id } } });
```

```ts
const c = social.community(communityId).as(actorId);
const dm = await c.conversations.create({ kind: "direct", recipient_actor_id: otherActorId });
const msg = await c.conversations.messages.create(dm.id, { body: "Hi" });
for await (const m of c.conversations.messages.list(dm.id)) console.log(m.body);
await c.conversations.messages.update(conversationId, messageId, { body: "Hi!" });
await c.conversations.messages.delete(conversationId, messageId);
void msg;
```

## Errors

```ts before
const { data, error } = await social.client.GET("/v1/communities/{community_id}/posts/{post_id}", { params: { path: { community_id, post_id } } });
if (error) console.error(error);
```

```ts
try {
  await social.community(communityId).as(actorId).posts.retrieve(postId);
} catch (err) {
  if (err instanceof NotFoundError) console.log(err.code, err.requestId, err.docUrl);
  else if (err instanceof BadRequestError) err.errors.forEach((e) => console.log(e.param, e.message));
  else if (err instanceof APIError) console.log(err.status);
  else throw err;
}
```

## Types

Request and response types are exported in the `Social` namespace, named after the resource: `Social.Post`, `Social.PostCreateParams`, `Social.Actor`. Where the same method exists on the workspace root and in the community scope (the webhook endpoints), the scoped copy's types carry the scope: `Social.WebhookEndpointCreateParams` (workspace) and `Social.CommunityScopedWebhookEndpointCreateParams` (community). The raw OpenAPI types stay exported as `paths` and `components`; `paths` is now declared as a type alias instead of an interface, which only matters if you merged declarations into it.

## What did not change

- `social.client` is the same typed `openapi-fetch` client over the same `paths`; it shares the credential and base URL but not retries.
- Wire fields stay snake_case, exactly as the API and the docs' curl tabs spell them.
- The base URL (`https://social.productcraft.co`) and the `PRODUCTCRAFT_API_KEY` fallback.
