# Athena Local

Athena Local is a planned lightweight, open-source, AWS Athena API-compatible local development server backed by Trino.

It is currently **pre-alpha planning-stage scaffolding**. The Athena facade, container runtime adapters, and local infrastructure lifecycle are not implemented yet.

## Purpose

Athena Local is intended to let applications use the real AWS SDK v3 `AthenaClient` locally with normal Athena commands while changing only endpoint, credentials, region, and environment configuration between local and production.

The goal is application-integration parity, not complete AWS infrastructure emulation.

## Problem Solved

Applications that use S3 and Athena in production often need local integration tests and development data without replacing production code paths. Athena Local will keep application code using:

- `@aws-sdk/client-athena`
- `@aws-sdk/client-s3`

Local compatibility work belongs in the local infrastructure layer, not in application repositories.

## Intended Audience

- TypeScript and Bun projects that use AWS Athena.
- Teams that want local integration tests through the real AWS SDK.
- Developers who want Trino-backed local Athena-like query execution.
- CI pipelines that need deterministic Athena/S3-style tests without using production AWS resources.

## Project Status

| Area | Status |
| --- | --- |
| Planning documents | Implemented |
| Repository metadata | Implemented |
| CLI skeleton | Implemented as placeholder |
| Athena API facade | Planned |
| Trino execution | Planned |
| SQLite query state | Planned |
| MinIO integration | Planned |
| AWS S3 backend | Planned, opt-in |
| Apple `container` runtime | Planned |
| Docker runtime | Planned |
| AWS SDK E2E tests | Planned |
| npm publication | Planned |

## Key Capabilities

Planned MVP capabilities:

- Accept real AWS SDK v3 Athena requests.
- Implement Athena AWS JSON protocol routing.
- Support `StartQueryExecution`, `GetQueryExecution`, `GetQueryResults`, and `StopQueryExecution`.
- Execute SQL through Trino.
- Persist query state in SQLite.
- Materialize CSV results to MinIO or opt-in AWS S3.
- Support pagination, polling, cancellation, and idempotency.
- Manage local infrastructure through Apple `container` or Docker.

## Architecture

```mermaid
flowchart TD
  App[Application]
  AthenaSDK[@aws-sdk/client-athena]
  S3SDK[@aws-sdk/client-s3]
  Facade[Bun Athena-compatible facade]
  SQLite[(SQLite)]
  Trino[Trino]
  HMS[Hive Metastore]
  PG[(PostgreSQL)]
  MinIO[(MinIO)]
  S3[(AWS S3 opt-in)]

  App --> AthenaSDK
  App --> S3SDK
  AthenaSDK --> Facade
  S3SDK --> MinIO
  S3SDK -.-> S3
  Facade --> SQLite
  Facade --> Trino
  Facade --> MinIO
  Facade -.-> S3
  Trino --> HMS
  HMS --> PG
  Trino --> MinIO
  Trino -.-> S3
```

## Parity Model

Athena Local targets application-integration parity:

- same AWS SDK clients
- same Athena command objects
- same polling flow
- same result-reading flow
- same S3 client type

It does not target full AWS service parity.

## Not A Full AWS Emulator

Athena Local does not emulate IAM, Lake Formation, KMS, CloudWatch, Glue crawlers, Athena billing, or complete AWS service behavior. Unsupported behavior is documented rather than silently approximated.

## Athena Operations

| Operation | Status | Notes |
| --- | --- | --- |
| `StartQueryExecution` | Planned | Real SDK contract tests required before support is claimed. |
| `GetQueryExecution` | Planned | Includes state and basic statistics. |
| `GetQueryResults` | Planned | Includes `MaxResults` and `NextToken`. |
| `StopQueryExecution` | Planned | Uses Trino cancellation where possible. |
| Other Athena APIs | Unsupported | May be added only with explicit scope and tests. |

## Supported Behavior

Planned MVP behavior:

- query execution IDs
- `ClientRequestToken` idempotency
- `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELLED`
- polling
- cancellation
- Athena-compatible response and error envelopes
- result pagination
- CSV result materialization
- `ResultConfiguration.OutputLocation`
- restart-aware persisted state

## Unsupported Behavior

Unsupported or not planned for MVP:

- full Athena API coverage
- full Glue API compatibility
- IAM policy evaluation
- Lake Formation
- KMS
- Glue crawlers
- Athena billing
- exact bytes-scanned parity
- federated Athena connectors
- complete workgroup enforcement
- full S3 emulation
- exact parity for every engine edge case

## Prerequisites

Current scaffolding:

- Bun
- Git

Planned runtime prerequisites:

- Apple `container` on supported macOS hosts, or
- Docker Engine/Docker Desktop where compatible

## Supported Operating Systems

Planned support:

| OS | Status |
| --- | --- |
| macOS | Planned, Apple `container` and Docker |
| Linux | Planned, Docker |
| Windows | Not planned for MVP |

## Supported Container Runtimes

| Runtime | Status |
| --- | --- |
| Apple `container` | Planned |
| Docker Engine | Planned |
| Docker Desktop | Planned where compatible |
| Docker Compose | Not required |

## Supported Storage Backends

| Backend | Status | Notes |
| --- | --- | --- |
| MinIO | Planned default | Offline local development. |
| AWS S3 | Planned opt-in | Requires explicit bucket and prefix. |
| Custom S3 server | Not planned | MinIO is used instead. |

## Installation

Not published yet.

Future npm installation is expected to use Bun:

```bash
bun add -d athena-local
```

## Quick Start

Runtime quick start is not implemented yet.

Planned flow:

```bash
bunx athena-local configure
bunx athena-local doctor
bunx athena-local start
bunx athena-local seed
```

## Interactive Setup

Planned:

```bash
athena-local configure
```

Interactive prompts are only used when stdin and stdout are TTYs.

## Noninteractive Setup

Planned noninteractive configuration uses flags and environment variables:

```bash
ATHENA_LOCAL_CONTAINER_RUNTIME=docker \
ATHENA_LOCAL_STORAGE_BACKEND=minio \
athena-local start --json
```

## CI Setup

Planned CI uses noninteractive commands and deterministic test mode:

```bash
bun install --frozen-lockfile
bun run typecheck
bun test
bun run test:protocol
```

Full integration tests use Docker on Linux.

## Configuration

Planned configuration separates:

- committed project config
- local uncommitted config
- secrets
- environment overrides
- generated runtime state

## Configuration Precedence

Planned precedence:

1. CLI flags
2. environment variables
3. local config
4. committed project config
5. defaults

Runtime selection additionally falls back to automatic detection and then TTY prompts.

## Environment Variables

Planned variables include:

| Variable | Purpose |
| --- | --- |
| `ATHENA_LOCAL_CONTAINER_RUNTIME` | `apple-container` or `docker` |
| `ATHENA_LOCAL_STORAGE_BACKEND` | `minio` or `s3` |
| `ATHENA_LOCAL_S3_BUCKET` | Explicit S3 bucket |
| `ATHENA_LOCAL_S3_PREFIX` | Explicit development prefix |
| `AWS_PROFILE` | Optional AWS profile |
| `AWS_REGION` | AWS region |
| `AWS_ENDPOINT_URL_S3` | Only when explicitly using custom S3 endpoints |

## Apple Container Usage

Planned Apple `container` support manages MinIO, Trino, Hive Metastore, and PostgreSQL through a shared runtime abstraction.

## Docker Usage

Planned Docker support uses Docker CLI directly through the shared runtime abstraction. Docker Compose is not required.

## MinIO Usage

MinIO is the default local object store for source data, fixtures, and Athena result output.

## AWS S3 Usage

AWS S3 is opt-in. Users must configure an explicit bucket and non-empty development prefix. Local reset and destroy do not imply remote deletion.

## AWS Credentials And Profiles

Real AWS credentials must come from normal AWS mechanisms such as profiles, environment variables, or workload identity. Credentials must not be committed or logged.

## Test Mode

Planned test mode provides deterministic startup, isolated state, generated run identifiers, explicit timeouts, machine-readable output, and cleanup.

Pure unit tests do not require containers or network access.

## Persistent Local Development Mode

Planned development mode uses persistent volumes and stable endpoints for long-running local applications.

## Start And Stop Behavior

Planned:

- `start` creates or starts services.
- `stop` stops services without deleting persistent data.

## Reset Versus Destroy

Planned:

- `reset` recreates local state for the selected project/run.
- `destroy` removes local services and local data after explicit intent.
- remote AWS S3 cleanup is separate and explicit.

## Seeding

Planned `seed` commands create buckets, catalog metadata, partitions, and deterministic fixture data.

## Running An Application Against The Service

Applications should use normal AWS SDK clients and configure local endpoints only in client construction.

## Real AWS SDK v3 Example

Planned local Athena client shape:

```ts
import { AthenaClient } from "@aws-sdk/client-athena";

export const athena = new AthenaClient({
  region: "us-east-1",
  endpoint: "http://127.0.0.1:4567",
  credentials: {
    accessKeyId: "local",
    secretAccessKey: "local-secret",
  },
});
```

## Athena Query Lifecycle Example

Planned flow:

1. `StartQueryExecutionCommand`
2. poll `GetQueryExecutionCommand`
3. page through `GetQueryResultsCommand`
4. optionally cancel with `StopQueryExecutionCommand`

## Health Checks

Planned health checks cover Athena facade, Trino, Hive Metastore, PostgreSQL, MinIO, ports, credentials-source status, and writable directories.

## Doctor Command

Planned:

```bash
athena-local doctor
```

Checks runtime detection, versions, ports, service health, storage configuration, credentials-source status, writable directories, and unsupported host conditions.

## CLI Command Reference

Current placeholder commands:

```bash
athena-local --help
athena-local --version
athena-local configure
athena-local doctor
athena-local start
athena-local stop
athena-local status
athena-local reset
athena-local destroy
athena-local seed
```

Runtime behavior is planned, not implemented.

## Common Workflows

Planned workflows:

- first local setup
- run application against MinIO and local Athena facade
- run deterministic E2E tests
- reset local data
- inspect doctor output
- opt-in AWS S3 backend testing

## Troubleshooting

Troubleshooting docs will cover runtime detection, port conflicts, MinIO credentials, Trino readiness, Hive Metastore startup, SQLite state, and AWS S3 safety validation.

## Security Considerations

- Do not commit credentials.
- Do not log Authorization headers or signed URLs.
- Use explicit prefixes for remote storage.
- Keep local reset separate from remote cleanup.
- Validate user-controlled paths and identifiers.
- Avoid shell invocation for subprocesses where possible.

## Remote S3 Safety

Remote deletion must reject empty prefixes, reject root-level operations, require explicit force or confirmation, and stay scoped to a project/run namespace.

## Data Persistence

Persistent development mode retains local MinIO, Hive Metastore, PostgreSQL, and optionally Athena state across `stop` and `start`.

## Deletion Behavior

Local deletion and remote deletion are separate. Remote S3 cleanup is never implied by local `reset` or `destroy`.

## Compatibility Matrix

### Runtime And Storage

| Runtime | MinIO | AWS S3 |
| --- | --- | --- |
| Apple `container` | Planned | Planned |
| Docker | Planned | Planned |

### Application Integration

| Behavior | Status |
| --- | --- |
| Real `AthenaClient` requests | Planned |
| Real `S3Client` requests | Planned |
| Local-only Athena adapter | Not planned |
| Direct app-to-Trino calls | Not supported |

### AWS Parity And Limitations

| Area | Status |
| --- | --- |
| Query lifecycle | Planned partial parity |
| Result pagination | Planned partial parity |
| IAM | Not planned |
| KMS | Not planned |
| Lake Formation | Not planned |
| Billing | Not planned |

## Known Limitations

Current limitations:

- no runtime implementation yet
- no Athena facade yet
- no Trino client yet
- no integration stack yet

Planned limitations:

- local behavior cannot prove all AWS engine edge cases
- real AWS contract tests remain necessary for high-risk parity gaps

## Differences From AWS Athena

Known planned differences:

- Trino is local and self-managed.
- Hive Metastore replaces Glue Data Catalog.
- SigV4 is accepted but not validated in MVP.
- Workgroup enforcement is minimal.
- Bytes-scanned statistics are approximate.

## Testing

Planned test commands:

```bash
bun test
bun run test:unit
bun run test:protocol
bun run test:sqlite
bun run test:integration
bun run test:e2e
bun run test:docker
bun run test:apple-container
bun run test:aws
bun run test:package
bun run test:release
bun run typecheck
bun run lint
bun run format:check
```

## Development Setup

Current scaffold:

```bash
bun install
bun run typecheck
bun test
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Release Process

Releases are planned through GitHub Actions with npm trusted publishing or another short-lived identity mechanism. Developer-workstation publishing is not the normal path.

## Versioning

Athena Local will use semantic versioning:

- alpha during early development
- beta after SDK contract behavior stabilizes
- `1.0` after documented MVP operations and lifecycle behavior are reliable

## Support Policy

See [SUPPORT.md](SUPPORT.md).

## License

MIT. See [LICENSE](LICENSE).

## Trademark And Non-Affiliation Disclaimer

AWS, Amazon Athena, Amazon S3, and related marks are trademarks of Amazon.com, Inc. or its affiliates.

Athena Local is an independent open-source project and is not affiliated with, endorsed by, sponsored by, or supported by Amazon Web Services.
