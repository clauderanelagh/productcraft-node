---
"@productcraft/notify-react": patch
---

`<NotifyInbox/>`: the popover now stays inside the viewport. It used to hang from the bell's right edge at a fixed width, so a bell on the left of the layout (a sidebar, a left-aligned header) opened it off-screen, with "Mark all as read" and most items out of reach. It now shifts sideways to keep a 16 px gutter, on open and on resize.
