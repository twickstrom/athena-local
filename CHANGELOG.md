# Changelog

This project follows semantic versioning once releases begin.

## Unreleased

- Athena-compatible facade for `StartQueryExecution`, `GetQueryExecution`, `GetQueryResults`, and `StopQueryExecution`.
- Trino HTTP statement-protocol client with submit, poll, and cancel.
- SQLite-backed query execution state with idempotency and restart awareness.
- CSV result materialization and paginated `GetQueryResults`.
- Container-backed local stack (PostgreSQL, MinIO, Hive Metastore, Trino) via Docker or Apple `container`.
- Configurable host ports for all local services.
- CLI: `configure`, `doctor`, `start`, `stop`, `status`, `reset`, `destroy`, `seed`.

## Release Strategy

- `0.x` alpha releases during early development.
- Beta releases after AWS SDK contract behavior stabilizes.
- `1.0.0` once the documented operations and lifecycle behavior are reliable across supported runtimes.
