# Changelog

This project follows semantic versioning.

## 0.1.0 - 2026-06-19

Initial public release.

### Added

- Athena-compatible facade over the AWS JSON protocol covering 12
  `@aws-sdk/client-athena` operations: `StartQueryExecution`,
  `GetQueryExecution`, `GetQueryResults`, `StopQueryExecution`,
  `BatchGetQueryExecution`, `ListQueryExecutions`, `GetWorkGroup`,
  `ListWorkGroups`, `GetDatabase`, `ListDatabases`, `GetTableMetadata`, and
  `ListTableMetadata`. Unsupported operations return a structured
  `InvalidRequestException` rather than a partial emulation.
- `QueryExecutionContext.Database`/`Catalog` honored per request.
- Athena-faithful result and error shapes, CSV result materialization, and
  paginated `GetQueryResults` with `MaxResults`/`NextToken`.
- Trino HTTP statement-protocol client (submit, poll, cancel) with Trino → Athena
  state and error mapping.
- SQLite-backed query-execution state: `ClientRequestToken` idempotency, WAL,
  and restart-aware reconciliation.
- Container-backed local stack (PostgreSQL, MinIO, Hive Metastore, Trino) on
  Docker or Apple `container` behind one runtime interface; OCI images pinned by
  digest.
- Storage backends: bundled MinIO (default), real AWS S3, and external attach
  mode (bring-your-own S3-compatible store) supporting `s3://` and `s3a://`
  external tables and partition sync through `StartQueryExecution`.
- Configurable host ports, runtime, and storage selection via `ATHENA_LOCAL_*`
  environment variables and CLI flags.
- CLI: `configure`, `doctor`, `start`, `stop`, `status`, `reset`, `destroy`,
  `seed`.
- Tested against `@aws-sdk/client-athena` 3.1071.0 through latest.

## Release Strategy

- `0.x`: the public API may change between minor versions (per semver).
- `1.0.0`: stable API across the documented operations and lifecycle behavior on supported runtimes.
