---
"@productcraft/mail": minor
---

Refresh mail OpenAPI types from production (mail-api/063, the SDK-grade Mail spec). Type-level changes on `.client`: response enums are named schemas, the 23 webhook events have typed payload schemas, `limit` query params are integers, template `data` and `variables_schema` are open objects, `POST /contacts/{contact}/segments/{segment_id}` documents only 201 (the API now answers 201 whether or not the contact was already a member), and the Domain Connect browser callback is no longer in the spec. No runtime change in the client.
