---
"@productcraft/notify-react": minor
---

`<NotifyInbox/>` and `renderMarkdown` now render lists in item bodies (`- item`, `* item`, `+ item` and `1. item`, one level). Data that Notify escapes into a template still can't start a list.

Accessibility fixes in the default theme: the timestamp on unread items now passes 4.5:1 contrast (`--pcn-muted` is `#636369` in light mode), and the mark-as-read and archive buttons are 32 px, or 44 px on touch screens. `<NotifyPreferences/>` now says "Couldn't load your notification settings." when loading fails, instead of the inbox's message. The new `preferencesLoadError` string ships in every locale and can be overridden with `strings`.
