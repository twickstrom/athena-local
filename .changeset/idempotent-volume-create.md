---
"athena-local": patch
---

Reuse a leftover named volume instead of failing the start. Apple `container
volume create` errors on an existing volume name (Docker's is idempotent), so a
data volume that survived a `stop` made the next `start` fail and roll back on
Apple container — requiring a manual cleanup. `volume create` is now
allow-failure in both runtime adapters; a genuinely missing volume still surfaces
at `container create`.
