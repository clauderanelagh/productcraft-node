---
"@productcraft/social": patch
---

Social spec refresh — search cursor pagination (task 022): both search
verticals now return a real `{ next_cursor, has_more }` and accept a
`cursor` query param; the hashtag autocomplete route joins the
`social-search` tag.
