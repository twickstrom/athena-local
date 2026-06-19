---
"athena-local": patch
---

Gate Trino readiness on it being able to serve queries. The readiness probe
accepted any 200 from `/v1/info`, but Trino returns 200 with `"starting":true`
during warmup, so the stack reported ready before the coordinator could run
queries (seed and live queries failed with "Trino server is still
initializing"). The HTTP readiness check can now require a response-body
substring, and Trino waits for `"starting":false` with a longer warmup timeout.
