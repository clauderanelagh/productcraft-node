---
"@productcraft/social": major
---

Path parameters are snake_case, like every other ProductCraft API: `"/v1/communities/{community_id}/posts/{post_id}"` with `params: { path: { community_id, post_id } }` replaces `{communityId}` / `{postId}`. Where a target actor sat next to the acting `actor_id`, the target now has its own name: `tags/{tagged_actor_id}`, `actors/{tagged_actor_id}/tagged`, `actors/{owner_actor_id}/highlights`, `members/{member_actor_id}`. Request URLs are unchanged, so this is a TypeScript-only break: rename the path keys and the `params.path` names (see "Migrating from 0.x to 1.0" in the README). Old path keys are not kept as deprecated aliases: openapi-fetch infers params from the exact path-key string, so an alias would need a second hand-maintained copy of all ~200 path types. Post `attributes` now come back with your keys exactly as stored (`imageUrl` stays `imageUrl`), and the moderation, post and connection routes are typed as authenticated.
