---
"@productcraft/auth": minor
---

Refresh the Auth OpenAPI types from production (users-api/096, the SDK-grade Auth spec): `limit` query params are typed as integers, sign-in responses carry `result` (`session` | `mfa_required` | `mfa_enrollment_required`), MFA enrolment payloads carry `type`, and webhook event payloads are typed. The consumer scope no longer passes a stub `authorization` header to the generated clients (the spec now declares the credential as a security scheme); behaviour is unchanged, the configured credential is still sent.
