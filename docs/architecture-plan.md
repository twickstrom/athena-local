# Athena Local Architecture Plan

## Purpose

Athena Local is a lightweight, open-source, AWS Athena API-compatible local development server backed by Trino.

The project lets applications use the real AWS SDK v3 `AthenaClient` and standard Athena commands locally while changing only endpoint, credentials, region, and environment configuration between local and production environments.

The primary goal is application-integration parity. Athena Local is not a full AWS emulator.

## Architecture Overview

```mermaid
flowchart TD
  App[Application using AWS SDK v3]
  S3SDK[@aws-sdk/client-s3]
  AthenaSDK[@aws-sdk/client-athena]
  Facade[Bun Athena-compatible API facade]
  SQLite[(SQLite query state)]
  Trino[Trino]
  HMS[Hive Metastore]
  PG[(PostgreSQL)]
  MinIO[(MinIO)]
  S3[(AWS S3 opt-in)]

  App --> S3SDK
  App --> AthenaSDK
  S3SDK --> MinIO
  S3SDK -. opt-in .-> S3
  AthenaSDK --> Facade
  Facade --> SQLite
  Facade --> Trino
  Facade --> MinIO
  Facade -. opt-in results .-> S3
  Trino --> HMS
  HMS --> PG
  Trino --> MinIO
  Trino -. opt-in .-> S3
```

## Core Decisions

- Bun is the only JavaScript and TypeScript runtime.
- TypeScript runs in strict mode.
- The Athena API facade is implemented with `Bun.serve()`.
- Query execution state is persisted with `bun:sqlite`.
- Trino is the local query engine.
- The Trino HTTP statement protocol is implemented directly with native `fetch()`.
- MinIO is the default local S3-compatible object store.
- AWS S3 is an opt-in storage backend with strict prefix-scoped safety controls.
- Hive Metastore provides catalog metadata.
- PostgreSQL persists Hive Metastore state.
- Apple `container` and Docker are both supported through a shared runtime abstraction.
- Docker Compose is not required.
- DuckDB is not used.
- No custom S3-compatible server is implemented.
- Application code continues to use `@aws-sdk/client-athena` and `@aws-sdk/client-s3`.

## Local And Production Client Boundary

Application code should construct normal AWS SDK clients in both local and production modes:

```ts
import { AthenaClient } from "@aws-sdk/client-athena";
import { S3Client } from "@aws-sdk/client-s3";
```

Local configuration changes only:

- endpoint
- credentials
- region
- result output location
- object storage bucket and prefix

Application repositories must not branch into direct Trino calls locally.

## Athena API Scope

The MVP supports application-level compatibility for:

- `StartQueryExecution`
- `GetQueryExecution`
- `GetQueryResults`
- `StopQueryExecution`

The facade must support:

- AWS JSON protocol routing through `X-Amz-Target`
- signed SDK requests without requiring signature validation
- query execution IDs
- `ClientRequestToken` idempotency
- `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`, and `CANCELLED`
- polling
- cancellation
- Athena-compatible response and error envelopes
- result pagination with `MaxResults` and `NextToken`
- `ResultConfiguration.OutputLocation`
- CSV result materialization
- basic query statistics and metadata
- restart-aware persisted state

## Trino Strategy

The facade submits SQL to Trino through `/v1/statement`, stores the Trino query ID and `nextUri`, follows `nextUri` until completion, and maps Trino states, statistics, rows, and errors into Athena-compatible behavior.

Cancellation uses the Trino protocol rather than local-only state mutation whenever a Trino query is active.

## State Strategy

SQLite is authoritative for Athena query execution state.

Requirements:

- WAL mode where appropriate
- explicit schema versioning
- prepared statements
- idempotent inserts keyed by `ClientRequestToken`
- persisted lifecycle state
- restart recovery policy
- cleanup and retention policy
- no authoritative state only in memory

## Catalog Strategy

Trino uses the Hive connector backed by Hive Metastore. Hive Metastore stores catalog metadata in PostgreSQL.

Athena DDL and Trino DDL are not treated as identical. The MVP should prefer explicit dialect-specific schema files over a broad SQL translator. A constrained translator can be considered later if the supported DDL surface becomes stable and small.

## Object Storage Strategy

MinIO is the default storage backend because it supports isolated offline development.

AWS S3 is supported for users who want the local Athena-compatible facade and Trino execution while reading from or writing to real S3 buckets. AWS S3 use is opt-in and must require explicit bucket and prefix configuration.

Destructive remote operations must:

- reject empty prefixes
- reject root-level bucket operations
- require explicit intent
- remain separate from local reset/destroy
- never log credentials or sensitive signed URLs
- remain scoped to a project or run namespace

## Container Runtime Strategy

The project supports:

- Apple `container`
- Docker Engine or Docker Desktop where compatible

Runtime adapters implement a shared contract for:

- availability detection
- version detection
- image pulling
- network creation
- volume creation
- container creation
- startup
- readiness
- logs
- stop
- reset
- destroy
- rollback
- port conflict detection
- status reporting

Runtime selection precedence:

1. CLI flag
2. Environment variable
3. Saved local configuration
4. Automatic detection
5. Interactive selection only when stdin and stdout are TTYs

## Execution Modes

Test mode is deterministic, isolated, noninteractive, and suitable for CI. Pure unit tests must run without containers or network access.

Persistent local development mode uses stable ports and persistent named volumes. `stop` must not delete persistent data. `reset` recreates local state. `destroy` removes services and local data. Remote S3 cleanup is separate and explicit.

## Configuration Strategy

Configuration is typed and validated at startup.

Separate:

- committed project configuration
- uncommitted local developer configuration
- secrets
- environment overrides
- generated runtime state

Secrets must not be committed.

## CLI Strategy

The planned CLI commands are:

- `athena-local configure`
- `athena-local doctor`
- `athena-local start`
- `athena-local stop`
- `athena-local status`
- `athena-local reset`
- `athena-local destroy`
- `athena-local seed`

The initial scaffold may expose command names before the behavior is implemented, but must clearly report that runtime operations are not yet available.

## Testing Strategy

Use `bun:test`.

Required layers:

- pure unit tests
- AWS JSON protocol tests
- SQLite tests
- fake Trino protocol tests
- storage contract tests
- runtime adapter contract tests
- full local integration tests
- end-to-end AWS SDK tests
- opt-in real AWS contract tests
- packaging and release tests

Do not claim support for an Athena behavior until covered by AWS SDK integration tests.

## Security And Supply Chain

The project requires:

- MIT license
- AWS trademark and non-affiliation disclaimer
- pinned OCI image versions
- pinned GitHub Actions where practical
- dependency and secret scanning
- package tarball inspection
- npm provenance
- SBOM generation where useful
- no committed credentials, `.env` files, local databases, logs, or runtime state

## Non-Goals

Athena Local does not implement:

- a general AWS emulator
- full Athena API coverage
- full Glue API compatibility
- IAM policy evaluation
- Lake Formation
- KMS behavior
- Glue crawlers
- Athena billing
- exact bytes-scanned parity
- federated Athena connectors
- complete workgroup enforcement
- every AWS throttling behavior
- complete S3 emulation
- exact parity for every Athena engine edge case

Unsupported behavior must be documented rather than silently approximated.
