# Changelog

This project follows semantic versioning.

## Unreleased

- Athena-compatible facade for `StartQueryExecution`, `GetQueryExecution`, `GetQueryResults`, and `StopQueryExecution`.
- Trino HTTP statement-protocol client with submit, poll, and cancel.
- SQLite-backed query execution state with idempotency and restart awareness.
- CSV result materialization and paginated `GetQueryResults`.
- Container-backed local stack (PostgreSQL, MinIO, Hive Metastore, Trino) via Docker or Apple `container`.
- Configurable host ports for all local services.
- CLI: `configure`, `doctor`, `start`, `stop`, `status`, `reset`, `destroy`, `seed`.

## Release Strategy

- `0.x`: the public API may change between minor versions (per semver).
- `1.0.0`: stable API across the documented operations and lifecycle behavior on supported runtimes.
