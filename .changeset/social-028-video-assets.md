---
"@productcraft/social": minor
---

Social spec refresh — video assets (task 028): POST
`/communities/:id/assets` accepts `kind: "video"` with declared
`content_type`/`byte_size` and returns presigned-PUT `upload`
instructions; new POST `/assets/:assetId/complete` finalizes the
upload and enqueues transcoding. Assets carry `kind`, `duration_s`,
`failure_reason`, and an `uploading` status; renditions gain
`video`/`poster` rungs with nullable `width`/`height`.
