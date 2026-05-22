# @productcraft/agora

## 0.0.5

### Patch Changes

- 3cbd97b: Full README audit against the live API: documents both caller contexts (PlatformUser admin on `/v1/workspaces/{workspaceId}/...` vs customer-backend on `/v1/communities/{communityId}/...` with the `X-Acting-As` header), expands the quick-start with a "post on behalf of an EndUser" example, and adds a Common-Operations section covering posts + feeds, stories, social graph, notifications, direct conversations, and moderation. Notes that Agora's wire is snake_case both at the DTO level and in TS types (no name translation layer for this surface).

## 0.0.4

### Patch Changes

- ce35855: Fix the package description + README framing — Agora is social infrastructure (communities, posts, feeds, stories, moderation), not "landing pages / marketing sites / content blocks" as the v0.0.3 README mistakenly claimed.

## 0.0.3

### Patch Changes

- 52b6058: Refresh agora OpenAPI types from production.
- 52b6058: Add READMEs so npmjs.com renders documentation for each package instead of "This package does not have a README." No functional changes.
- Updated dependencies [52b6058]
  - @productcraft/core@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies [47e7e8c]
  - @productcraft/core@0.0.2
