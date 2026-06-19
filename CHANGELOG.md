# Changelog

This project follows semantic versioning.

## 0.1.1

### Patch Changes

- [`9e85cc7`](https://github.com/twickstrom/athena-local/commit/9e85cc7dec044dc79500376c3882189a9714c561) Thanks [@twickstrom](https://github.com/twickstrom)! - Fix stack boot on Docker Engine (Linux): the Hive and Trino config volumes used
  a relative bind-mount source, which Docker Engine rejects as an invalid volume
  name (it only worked on macOS runtimes that tolerate relative bind paths). The
  service definitions now resolve config bind sources to absolute paths.

- [`3b02f5f`](https://github.com/twickstrom/athena-local/commit/3b02f5fdbf6615e292d233150370cb05da937773) Thanks [@twickstrom](https://github.com/twickstrom)! - Gate Trino readiness on it being able to serve queries. The readiness probe
  accepted any 200 from `/v1/info`, but Trino returns 200 with `"starting":true`
  during warmup, so the stack reported ready before the coordinator could run
  queries (seed and live queries failed with "Trino server is still
  initializing"). The HTTP readiness check can now require a response-body
  substring, and Trino waits for `"starting":false` with a longer warmup timeout.

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
