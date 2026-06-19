# Changelog

## 0.1.3

### Patch Changes

- [`81716fd`](https://github.com/twickstrom/athena-local/commit/81716fd7069fdf917fd42fbaa9efe65b9ad465e5) Thanks [@twickstrom](https://github.com/twickstrom)! - Add a `query` subcommand for end-to-end verification without writing SDK code:
  `athena-local query "SELECT 1" [--database <name>] [--json]` runs a one-shot
  StartQueryExecution → poll → GetQueryResults against the running facade over the
  real AWS-JSON protocol and exits non-zero if the statement fails — a handy
  CI/diagnostic primitive.

This project follows semantic versioning.

## 0.1.2

### Patch Changes

- CLI accuracy fixes:

  - `--version` now reports the real package version (read from package.json)
    instead of `0.0.0`.
  - `status --json` reports the configuration the running stack was actually
    started with (persisted at start, paired with live per-service health)
    rather than the ambient env defaults, with a `configSource` of `running` or
    `resolved`. The on-disk snapshot is an explicit non-secret allowlist —
    credentials are never written to disk.
  - A failed `start` (e.g. a required host port in use) exits non-zero, so
    automation can detect it (covered by a regression test).

- Make external (attach) mode usable end to end:

  - Default the query results location into the configured external store
    (`s3://<ATHENA_LOCAL_S3_BUCKET>/[<prefix>/]athena-local-results/`) instead of
    the bundled-MinIO results bucket, which external mode does not run — every
    query previously failed with "The specified bucket does not exist".
  - Per-query `ResultConfiguration.OutputLocation` targeting the configured bucket
    is now honored (the default bucket matches it), and the bucket-mismatch error
    is now actionable.
  - Skip the bundled-MinIO port precheck (9000/9001) in the s3/external backends,
    which the launch already skips — external mode no longer collides with the
    store it attaches to.

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
