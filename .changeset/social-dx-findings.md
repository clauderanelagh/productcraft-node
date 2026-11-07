---
"@productcraft/social": minor
---

App-social review fixes, all from the spec or the generator:

- **A post without content no longer compiles.** `Social.PostCreateParams` needs a `title`, a `body` or a `url`; `posts.create({})` is a type error instead of a 400. The generated example sends a title.
- **One canonical path for a community's webhooks: `social.community(id).webhooks.*`.** `social.communities.webhooks.*(communityId, …)` reached the same endpoints through a second route; its methods and `Social.CommunityWebhook…Params` types are now `@deprecated` with a pointer, kept for all of 1.x.
- **A malformed path id names the parameter.** `posts.retrieve("not-a-uuid")` throws `BadRequestError` with `code: "VALIDATION_ERROR"` and `errors: [{ param: "post_id", code: "isUuid", … }]` (it was `BAD_REQUEST` with no `errors`).
- **The reference chains `.as(actorId)` only where it fills `actor_id`.** `actors.create`, `posts.delete` and the other calls that take no actor no longer show it.
- `withResponse().rateLimit` is set on Social (the named `-short`/`-long` windows, parsed since `@productcraft/core` 1.2.0); the live smoke checks it.
