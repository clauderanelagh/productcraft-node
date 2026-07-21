---
"@productcraft/social": minor
---

Add per-post interaction settings to the Post schema: `settings` object with `comments` policy (everyone/followers/mentioned/off), `hide_reaction_counts`, `allow_repost`, and `allow_quote`. Settable on post create and PATCH via `PostSettingsInputDto`.
