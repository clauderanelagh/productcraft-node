# @productcraft/trawl

## 0.1.3

### Patch Changes

- 67239e6: `json_schema` on job creation and `json_schema` / `result` on job responses are now typed `Record<string, unknown>` instead of `Record<string, never>`, so a real JSON Schema type-checks without an `as never` cast.

## 0.1.2

### Patch Changes

- f696df6: Refresh trawl OpenAPI types from production.
- 5adf146: Refresh trawl OpenAPI types from production.
- bee8f96: Package metadata: homepage now points at the product docs on productcraft.co, an issue tracker link is listed, and README links work on npmjs.com.
- Updated dependencies [bee8f96]
  - @productcraft/core@0.2.1

## 0.1.1

### Patch Changes

- ee0f176: Routine spec refresh: trawl declares the 429 rate-limit response on job submission; minor auth description updates.

## 0.1.0

### Minor Changes

- 2904862: Add `@productcraft/trawl` — typed client for the ProductCraft Trawl AI
  web-extraction API (jobs + webhooks). Also surfaced on the `productcraft`
  umbrella as `pc.trawl`, and `PC_BASE_URL.trawl` added to `@productcraft/core`.

### Patch Changes

- Updated dependencies [2904862]
  - @productcraft/core@0.2.0
