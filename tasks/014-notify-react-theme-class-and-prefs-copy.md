# 014 — notify-react: follow a `.dark` class theme; preference-centre copy

**Status:** pending
**Priority:** 14
**Dependencies:** none
**Found:** piloting Notify in WriteWave (writewave tasks/app/006, 2026-11-13)

## Summary

1. `styles.css` switches to dark on `prefers-color-scheme: dark`, `.pcn-dark` or `[data-theme="dark"]`. The most common React setup (Tailwind `dark:` + next-themes, `class="dark"` on `<html>`) matches none of these, so the inbox follows the OS, not the app: an app in light mode on a dark OS gets a dark popover. WriteWave had to re-declare every variable under a `.ww-notify:not(.pcn-light)` selector to out-rank the media query.
2. `<NotifyPreferences/>` always prints "Required notifications still arrive." under "Turn off all optional notifications", even when the workspace has no mandatory category (WriteWave has none).

## Requirements

- Dark tokens also apply under `.dark` ancestors, and a `.light` ancestor (or `data-theme="light"`) forces light even on a dark OS. README styling section says so.
- The "required still arrive" hint only renders when at least one shown cell is mandatory.

## Testing

Browser test (notify-react-browser) for `.dark`/`.light` ancestors against an emulated dark OS; component test for the hint.

## Definition of Done

- [ ] Released; WriteWave drops its override block in `apps/web/app/global.css`; this file deleted.
