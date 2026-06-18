# Chat Handoff

This repository continues work from prior planning conversations.

## Authoritative Context

Read these files before making architectural decisions:

- `../AGENTS.md`
- `architecture-plan.md`
- `mvp-implementation-plan.md`, once created

## Project Objective

Build a lightweight, open-source, AWS Athena API-compatible local development facade backed by Trino.

Applications must use the real AWS SDK v3 `AthenaClient` locally and in production. Only endpoint, credentials, region, and environment configuration should change.

## Current Reconciled Decisions

- Bun is the only JavaScript and TypeScript runtime.
- TypeScript must run in strict mode.
- Do not use DuckDB.
- Do not build a custom S3-compatible server.
- Do not require Docker Compose.
- Support both Apple `container` and Docker through a shared runtime abstraction.
- Use MinIO as the default local object-storage backend.
- Support opt-in AWS S3 as a separate storage backend with strict safety controls.
- Use Trino as the Athena-compatible query engine.
- Use Hive Metastore for local catalog metadata.
- Use PostgreSQL for Hive Metastore persistence.
- Use `Bun.serve()` for the local Athena API server.
- Use `bun:sqlite` for query execution state.
- Use native `fetch()` for Trino's HTTP protocol.
- Use `Bun.S3Client` internally for result materialization and fixtures.
- Application integration must continue using:
  - `@aws-sdk/client-athena`
  - `@aws-sdk/client-s3`
- License the repository under MIT with copyright holder `Tim Wickstrom`.
- Keep examples generic and public-project-safe.

## Initial Athena API Scope

Implement application-level parity for:

- `StartQueryExecution`
- `GetQueryExecution`
- `GetQueryResults`
- `StopQueryExecution`

Also support:

- Query execution IDs
- `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`, and `CANCELLED` states
- Polling behavior
- Result pagination
- `ClientRequestToken` idempotency
- Athena-style errors
- CSV result materialization
- `ResultConfiguration.OutputLocation`
- Integration tests through the real AWS SDK

## Explicit Non-Goals

Do not attempt to implement:

- A general AWS emulator
- Full Athena API coverage
- Full Glue API compatibility
- IAM policy evaluation
- Lake Formation
- KMS
- Athena billing
- Exact bytes-scanned parity
- Glue crawlers
- Federated connectors
- Complete workgroup policy enforcement

## Current Task

The current planning/setup task is to:

1. Reconcile authoritative planning documents.
2. Produce `mvp-implementation-plan.md`.
3. Create foundational public repository documentation and metadata.
4. Establish the GitHub repository safely.
5. Avoid production feature implementation until a specific milestone is requested.

GitHub mutation must use only the `twickstrom` GitHub identity. Verify with:

```bash
gh api user --jq .login
```

Proceed only when the result is exactly:

```text
twickstrom
```
