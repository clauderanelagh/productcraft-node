# @productcraft/social

Typed Node.js SDK for [ProductCraft Social](https://productcraft.co) — social-as-a-service backend: communities, posts, ranked feeds, stories (with polls + close-friends), direct conversations, notifications, moderation, flags. Generic actor / object / edge primitives.

```bash
npm install @productcraft/social
```

Server-side only. Customer-facing apps integrate via a backend (BFF pattern) that holds the workspace PAK (`pcft_live_…`).

## Two caller contexts

Social's surface splits two ways — both reach the same data but differ in auth + URL shape:

| Caller | URL prefix | Auth | What you do |
|---|---|---|---|
| **PlatformUser admin** | `/v1/workspaces/{workspaceId}/...` | cookie or PAK | Create communities, run moderation, read analytics. |
| **Customer backend** | `/v1/communities/{communityId}/...` | PAK + `X-Acting-As: <actor_id>` header | Day-to-day reads/writes on behalf of an EndUser. |

The customer backend acts on behalf of one of its EndUsers via the `X-Acting-As` header — the SDK passes whatever you put in headers straight through, so a per-request wrapper that injects the acting actor id is idiomatic.

## Quick start — create a community (admin)

```ts
import { Social } from "@productcraft/social";

const social = new Social({
  auth: { type: "apiKey", key: process.env.PCFT_KEY! },
});

const { data, error } = await social.client.POST(
  "/v1/workspaces/{workspaceId}/communities",
  {
    params: { path: { workspaceId: "<workspace-uuid>" } },
    body: { display_name: "Founders Club", slug: "founders" },
  },
);
```

## Quick start — post on behalf of an EndUser (customer backend)

```ts
const actor_id = "<actor-uuid>"; // the EndUser's Social actor id

const { data, error } = await social.client.POST(
  "/v1/communities/{communityId}/posts",
  {
    params: {
      path: { communityId: "<community-uuid>" },
      header: { "X-Acting-As": actor_id },
    },
    body: {
      // `actor_id` is required in the body too — the header sets caller
      // identity; the body field is the author of the post (typically
      // the same UUID, but allowed to differ on admin-impersonation flows).
      actor_id,
      text: "Hello, world!",
      visibility: "public",
    },
  },
);
```

Social's wire is snake_case both at the DTO level and in TS types — there's no name translation layer for this surface. Use snake_case keys in `body` to match what the API actually accepts.

## Configuration

```ts
new Social({
  auth: { type: "apiKey", key: "pcft_live_..." }
      | { type: "bearer", token: "eyJ..." }
      | { type: "cookie", value: "auth_token=..." },
  baseUrl: "https://social.example.test",  // optional override
  fetch: customFetch,                      // optional
});
```

## Common operations

### Posts + feeds

```ts
// Create a post
await social.client.POST(
  "/v1/communities/{communityId}/posts",
  { params: { path: { communityId } }, body: { text: "..." } },
);

// Get the actor's ranked home feed
await social.client.GET(
  "/v1/communities/{communityId}/actors/{actorId}/feed",
  { params: { path: { communityId, actorId } } },
);

// Discover (community-wide ranked feed, not personalised to follows)
await social.client.GET(
  "/v1/communities/{communityId}/discover-feed",
  { params: { path: { communityId } } },
);

// React / unreact / bookmark / quote / repost — same shape, different paths
```

### Stories

```ts
// Post a story (24h TTL)
await social.client.POST(
  "/v1/communities/{communityId}/stories",
  { params: { ... }, body: { media_url: "...", visibility: "close_friends" } },
);

// Story tray (the bubble row at the top of the home screen)
await social.client.GET(
  "/v1/communities/{communityId}/actors/{actorId}/story-tray",
  { ... },
);
```

### Social graph

```ts
// Follow / unfollow
await social.client.PUT(
  "/v1/communities/{communityId}/follows/{srcActorId}/{dstActorId}",
  { ... },
);

// Block / mute / restrict — same shape, different paths
// Close friends, hashtag follows, muted terms — all under /actors/{actorId}/...
```

### Notifications

```ts
// List
await social.client.GET(
  "/v1/communities/{communityId}/actors/{actorId}/notifications",
  { ... },
);

// Unread count for the bell badge
await social.client.GET(
  "/v1/communities/{communityId}/actors/{actorId}/notifications/unread-count",
  { ... },
);

// Mark all read
await social.client.POST(
  "/v1/communities/{communityId}/actors/{actorId}/notifications/read-all",
  { ... },
);
```

### Direct conversations

```ts
// Start / open a conversation
await social.client.POST(
  "/v1/communities/{communityId}/conversations",
  { params: { ... }, body: { members: ["act_a", "act_b"] } },
);

// Send a message
await social.client.POST(
  "/v1/communities/{communityId}/conversations/{conversationId}/messages",
  { ... },
);
```

### Moderation (workspace admin)

```ts
// List flags
await social.client.GET(
  "/v1/workspaces/{workspaceId}/communities/{communityId}/moderation/flags",
  { ... },
);

// Act on a flag (resolve / dismiss / take action on the target)
await social.client.POST(
  "/v1/workspaces/{workspaceId}/communities/{communityId}/moderation/flags/{flagId}/actions",
  { params: { ... }, body: { action: "remove_content", note: "..." } },
);

// Shadow-ban an actor
await social.client.PUT(
  "/v1/workspaces/{workspaceId}/communities/{communityId}/moderation/actors/{actorId}/shadow-ban",
  { ... },
);
```

## How this SDK is built

Generated from the live OpenAPI spec at `https://social.productcraft.co/docs-json` via [`openapi-typescript`](https://openapi-ts.dev/) + [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/). The nightly `spec-refresh` workflow opens a PR whenever the spec changes.

## License

[MIT](https://github.com/clauderanelagh/productcraft-node/blob/main/LICENSE).
