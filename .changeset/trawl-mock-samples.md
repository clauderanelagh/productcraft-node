---
"@productcraft/trawl": patch
---

`@productcraft/trawl/testing`: `createMockFetch()` returns real enum values for `status` fields (1.0.1 sent the string spread into an object, e.g. `{ "0": "q", … }`, or `null` in list items), and a polled `jobs.retrieve` answers with a terminal status, so `jobs.poll()` and `jobs.createAndPoll()` finish against the default mock instead of timing out.
