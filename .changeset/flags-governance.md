---
"@productcraft/flags": minor
---

Flags governance: change requests (`flags.settings.values.changeRequests.create`, `flags.changeRequests.list|retrieve|apply|approve|reject|cancel|rebase|schedule`), scheduled changes (`flags.settings.values.scheduledChanges.create`, `flags.scheduledChanges.*`), timed percentage ramps (`flags.settings.values.ramps.create`, `flags.ramps.pause|resume|cancel`) and the stale-flag report (`flags.projects.staleFlags.list`, `sendDigest`). Environments gain `approval_policy` and `required_approvals`; projects gain `stale_after_days` and `stale_digest`; settings gain the `released` and `deprecated` lifecycles.
