# AGENTS.md

Guidance for LLMs and coding agents working in **or** integrating against
`athena-local`. This file reflects what has shipped — when it disagrees with the
code, the code wins; please update this file in the same change.

## What this is

`athena-local` is a local development server that speaks the **AWS Athena API**
(AWS JSON protocol) and executes queries on **Trino**. Applications talk to it
with the real `@aws-sdk/client-athena` v3 `AthenaClient` — only the endpoint,
region, and credentials differ from production. The goal is *application-level
compatibility*, not full AWS emulation.

It runs entirely on the developer's machine and collects no telemetry. It is not
affiliated with or endorsed by Amazon Web Services; "Athena" and "AWS" are
trademarks of Amazon.

## Quick start

Prerequisites: Bun ≥ 1.3 and a container runtime (Docker or Apple `container`).

```bash
bunx athena-local doctor    # check the runtime and host ports
bunx athena-local start     # boot Postgres + MinIO + Hive + Trino + the facade
bunx athena-local seed      # optional: a default.athena_local_smoke sample table
```

`start` serves the facade on `http://localhost:4567` once the stack is healthy
(`GET /health` returns `{ok:true}`); then point the AWS SDK at it (below). `stop`
and `destroy` tear it down. `--facade-only` serves just the protocol with no
containers — queries still need Trino, so it is for protocol/wiring checks only.

Verify the stack end to end without writing SDK code:

```bash
bunx athena-local query "SELECT 1"            # one-shot StartQuery -> poll -> results
bunx athena-local query "SELECT * FROM events" --database analytics --json
```

`query` drives the running facade over the real AWS-JSON protocol and exits
non-zero if the statement fails — a handy CI/diagnostic primitive.

## How an application consumes it

Point the AWS SDK clients at the local stack — no app code changes beyond config:

```ts
import { AthenaClient, StartQueryExecutionCommand } from "@aws-sdk/client-athena";

const athena = new AthenaClient({
  endpoint: "http://localhost:4567",      // facade (ATHENA_LOCAL_PORT_ATHENA)
  region: "us-east-1",
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
});

await athena.send(new StartQueryExecutionCommand({
  QueryString: "SELECT * FROM events LIMIT 10",
  QueryExecutionContext: { Database: "analytics" },     // honored per query
  // OutputLocation is optional — it defaults per backend (see below).
}));
```

`seed` creates a `default.athena_local_smoke` table you can query immediately
(`Database: "default"`); `analytics`/`events` above stand in for your own
database and tables — register external tables with `CREATE EXTERNAL TABLE` DDL
(see attach mode). The default WorkGroup is `primary`.

Results land in object storage; read them with `@aws-sdk/client-s3` pointed at
MinIO (`http://localhost:9000`, creds `local`/`local-secret`) for the `minio`
backend, or at your real/attached store for the `s3`/`external` backends.

Key compatibility facts a consuming agent should know:

- **Supported operations are a subset** (see below). Unsupported operations
  return a structured `InvalidRequestException`, never a partial emulation.
- `QueryExecutionContext.Database` is honored **per request** (mapped to a Trino
  schema); `Catalog` maps to a Trino catalog (`AwsDataCatalog` → the local
  catalog, other names pass through).
- DDL and partition maintenance go through `StartQueryExecution` exactly as on
  Athena (e.g. `CREATE EXTERNAL TABLE … LOCATION 's3://…'`,
  `CALL system.sync_partition_metadata(...)`). Both `s3://` and `s3a://`
  locations work.
- Results write to the configured results bucket. A per-query
  `ResultConfiguration.OutputLocation` is honored when it targets that bucket; a
  different bucket is rejected by a single-bucket safety guard (set
  `ATHENA_OUTPUT_LOCATION` / `ATHENA_LOCAL_S3_BUCKET` to change it).
- Result shapes match Athena: a header row first, `NULL` as an empty `Datum`
  (no `VarCharValue` key), `bigint` as a decimal string, JSON as verbatim
  varchar. Don't break these — a `test/unit/result-shape-parity.test.ts` golden
  test pins them.
- Tested against `@aws-sdk/client-athena` **3.1071.0 → latest** (weekly matrix).
- No credentials are written to disk. The running-config snapshot under
  `.athena-local/` (gitignored) is an explicit non-secret allowlist; external S3
  keys are read from env at boot and never persisted.

## Supported Athena operations

Routed in `src/protocol/router.ts`, validated in `src/protocol/validate.ts`,
served by `src/facade/service.ts` (12 total):

- Query lifecycle: `StartQueryExecution`, `GetQueryExecution`,
  `GetQueryResults`, `StopQueryExecution`
- Query reads: `BatchGetQueryExecution`, `ListQueryExecutions` (workgroup
  filter + opaque pagination)
- Workgroups: `GetWorkGroup`, `ListWorkGroups` (report the configured output
  location)
- Catalog metadata: `GetDatabase`, `ListDatabases`, `GetTableMetadata`,
  `ListTableMetadata` (via Trino `information_schema`)

The README holds the full ~70-operation matrix with the reason each
unimplemented operation is out of scope.

## Architecture (as built)

- Bun Athena-compatible API facade (`src/facade`, `src/protocol`, `src/server`)
- Trino query engine; HTTP statement protocol client (`src/trino`, native
  `fetch`, follows `nextUri`, maps Trino states/errors → Athena)
- SQLite for query-execution state (`src/state`, `bun:sqlite`, WAL, prepared
  statements, `ClientRequestToken` idempotency, restart-aware)
- Storage (`src/storage`): MinIO by default; `Bun.S3Client` is an internal
  implementation detail (result materialization, seeding, tests) — never a
  substitute for the app's own `@aws-sdk/client-s3`
- Hive Metastore + PostgreSQL for catalog persistence
- Container runtime adapters behind one typed interface (`src/runtime`):
  Docker and Apple `container`. Apple `container` has no inter-container DNS, so
  inter-service traffic is routed through the discovered host gateway
  (`resolveHostGateway`); Docker uses `--network-alias` service names.

## Storage backends & attach mode

`ATHENA_LOCAL_STORAGE_BACKEND` (or `--storage-backend`):

- `minio` (default): bundled MinIO owns the result/data store.
- `s3`: attach to real AWS S3 (no bundled MinIO).
- `external`: attach to any S3-compatible store `athena-local` does not own.
  Requires `ATHENA_LOCAL_S3_BUCKET` + `ATHENA_LOCAL_S3_ENDPOINT`. The catalog
  Postgres auto-defaults to host **5433** (avoids colliding with a developer's
  own 5432) unless a port is set explicitly — if you already use 5433, override
  with `ATHENA_LOCAL_PORT_POSTGRES`. A `localhost`/`127.0.0.1` endpoint
  is rewritten to the container-reachable gateway (logged, scoped strictly to
  localhost so real hostnames pass through). Credentials come from
  `ATHENA_LOCAL_S3_ACCESS_KEY`/`_SECRET_KEY` or the AWS credential chain.

For the `s3` and `external` backends (no bundled MinIO), query **results**
default to a scoped prefix in the attached store —
`s3://<ATHENA_LOCAL_S3_BUCKET>/[<ATHENA_LOCAL_S3_PREFIX>/]athena-local-results/`.
Override with `ATHENA_OUTPUT_LOCATION` or a per-query `OutputLocation` that
targets that same bucket. The bundled-MinIO ports (9000/9001) are neither bound
nor prechecked in these modes, so the store you attach to may sit on 9000.

## Recipe: attach to an existing S3 / MinIO store

The most common non-default path — point `athena-local` at a store you already
run, register your data as an external table, and query it:

```bash
# 1. Attach: backend + bucket + endpoint + creds for the store (here on :9000).
export ATHENA_LOCAL_STORAGE_BACKEND=external
export ATHENA_LOCAL_S3_BUCKET=analytics
export ATHENA_LOCAL_S3_ENDPOINT=http://localhost:9000
export ATHENA_LOCAL_S3_ACCESS_KEY=... ATHENA_LOCAL_S3_SECRET_KEY=...
bunx athena-local start   # blocks until healthy; results default to
                          # s3://analytics/athena-local-results/
```

```ts
// 2. Through the real AthenaClient — register + query, all via StartQueryExecution:
//   CREATE EXTERNAL TABLE events (id bigint, label varchar)
//     PARTITIONED BY (dt varchar) LOCATION 's3://analytics/events/';  -- s3:// or s3a://
//   CALL system.sync_partition_metadata('default', 'events', 'FULL');
//   SELECT * FROM events WHERE dt = '2026-06-19';
```

Read results from the same attached store with `@aws-sdk/client-s3` (endpoint
`http://localhost:9000`); set `ATHENA_OUTPUT_LOCATION` if you don't want results
in the data bucket.

## Lifecycle, readiness & inspection

- `start` boots the stack and **blocks until every service is healthy**, then
  serves the facade; it **exits non-zero** if boot or readiness fails (safe to
  gate CI on). `GET http://localhost:4567/health` → `{"ok":true}` once up.
- `stop` stops the containers but **keeps volumes** (data survives; resume with
  `start`). `reset` **destroys and recreates** (wipes volumes — fresh stack).
  `destroy` removes containers, volumes, and the network (full teardown). In CI,
  use `destroy` (clean) or `reset` (fresh) between runs; `stop` preserves data.
- `status --json` reports the config the stack was **started with** (from the
  snapshot, `configSource:"running"`) alongside **live** per-service health —
  paired, so a lingering snapshot after an unclean exit still shows truthful
  health:

```jsonc
{
  "config": { "storageBackend": "external", "ports": { "athena": 4567 } },
  "configSource": "running",          // "resolved" when nothing is running
  "runningSince": "2026-06-19T00:00:00.000Z", // present only when running
  "serviceStatus": [
    { "name": "trino", "state": "running", "healthy": true }
  ],
  "runtimeStatus": { "runtime": "docker", "available": true, "services": [] }
}
```

## Troubleshooting (error → cause)

| Error (substring) | Likely cause | Fix |
|---|---|---|
| `The specified bucket does not exist` | Results location points at a bucket the store doesn't have (e.g. the bundled-MinIO results bucket while in external mode) | Set `ATHENA_OUTPUT_LOCATION` / `ATHENA_LOCAL_S3_BUCKET` to a bucket in the attached store |
| `Storage operation targets bucket … writes results to …` | A per-query `OutputLocation` targets a different bucket than the configured one | Use the configured bucket, or change `ATHENA_LOCAL_S3_BUCKET` / `ATHENA_OUTPUT_LOCATION` |
| `Trino server is still initializing` | Queried before the stack was ready | Wait for `start` to return, or poll `GET /health` for `{ok:true}` |
| `InvalidRequestException` on an operation | The operation is outside the supported subset (by design) | Use a supported operation (see the list above) |
| `required host ports are unavailable` | A needed host port is already in use | Free it or remap via `ATHENA_LOCAL_PORT_*` |

## Configuration reference

Resolution precedence (high → low): CLI flag → environment variable → saved
config file → automatic detection. Validate all config at startup
(`src/config`); never prompt in CI/non-interactive runs.

- Ports: `ATHENA_LOCAL_PORT_ATHENA` (4567), `_TRINO` (8080), `_MINIO` (9000),
  `_MINIO_CONSOLE` (9001), `_HIVE_METASTORE` (9083), `_POSTGRES` (5432; auto-5433
  in s3/external mode); `ATHENA_LOCAL_PORT` / `--port` overrides the facade port.
- Runtime: `ATHENA_LOCAL_CONTAINER_RUNTIME` / `--runtime` (`docker` |
  `apple-container`).
- Storage: `ATHENA_LOCAL_STORAGE_BACKEND`, `ATHENA_LOCAL_S3_BUCKET`,
  `ATHENA_LOCAL_S3_ENDPOINT`, `ATHENA_LOCAL_S3_PREFIX`,
  `ATHENA_LOCAL_S3_ACCESS_KEY`, `ATHENA_LOCAL_S3_SECRET_KEY`;
  MinIO: `ATHENA_LOCAL_MINIO_ENDPOINT`/`_ACCESS_KEY`/`_SECRET_KEY`.
- Engine: `ATHENA_LOCAL_TRINO_CATALOG`, `ATHENA_LOCAL_TRINO_USER`,
  `ATHENA_LOCAL_STATE_PATH`, `ATHENA_LOCAL_PROJECT_ID`, `ATHENA_LOCAL_RUN_ID`,
  `ATHENA_LOCAL_EXECUTION_MODE`, `ATHENA_LOCAL_OUTPUT_MODE`.
- Real-S3 fallbacks honor the standard `AWS_*` chain (`AWS_REGION`,
  `AWS_PROFILE`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
  `AWS_SESSION_TOKEN`, `AWS_ENDPOINT_URL_S3`).

CLI commands (`bunx athena-local <cmd>`): `configure`, `doctor`, `start`,
`stop`, `status`, `reset`, `destroy`, `seed`, `query`. Notable flags:
`--facade-only`, `--mode`, `--project-id`, `--run-id`, `--s3-bucket`,
`--s3-prefix`, `--database` (for `query`), `--json`.

## Repository map

- `src/cli`, `src/cli.ts` — argument parsing and command dispatch
- `src/protocol` — AWS JSON routing, request validation, Athena wire types
- `src/facade` — operation handlers, output-location resolution
- `src/trino` — statement-protocol client, parsing, error mapping
- `src/state` — SQLite repository, transitions, schema
- `src/storage` — Bun S3 client, bucket/key safety, types
- `src/runtime` — Docker / Apple `container` adapters, lifecycle, readiness
- `src/infra` — service definitions, runtime config (hive-site.xml etc.)
- `src/server` — Bun HTTP server, bootstrap wiring
- `src/seed`, `src/doctor`, `src/config`, `src/results`
- `scripts/` — header/format checks, package smoke (tarball budget + secret scan)

## Working agreements (contributors)

- **Bun only** for JS/TS. Prefer Bun-native/Web APIs (`Bun.serve`, `bun:sqlite`,
  `Bun.S3Client`, `Bun.spawn`, `bun:test`, `fetch`, `Bun.file`). No Node-only
  native addons. No npm/pnpm/Yarn lockfiles. No DuckDB. No custom
  S3-compatible server (use MinIO).
- **Strict TypeScript.** Avoid `any`; validate external input with `unknown`.
  Keep AWS protocol types separate from internal domain and Trino types.
- **Security invariants** (a security review baselined these — keep them):
  build subprocesses with `Bun.spawn` argument arrays, never a shell string;
  use SQLite `?` placeholders; validate database/table identifiers
  (`expectIdentifier`) before they reach SQL, and escape SQL string literals at
  the sink (`quoteSqlLiteral`); enforce storage key/prefix safety
  (`src/storage/safety.ts`); never log credentials or signed URLs
  (`redactCommand`).
- Real AWS S3 is opt-in and safe-by-default: require explicit bucket+prefix,
  reject empty/destructive prefixes, keep local reset separate from remote
  cleanup.
- Pin OCI images by tag **and** `@sha256` digest (`src/infra/services.ts`); no
  floating `latest`. Pin GitHub Actions by commit SHA.
- Add tests with every behavior change; add a regression test for every
  discovered compatibility issue. Do not claim an operation is supported without
  an AWS SDK integration test covering it.
- Keep it open-source-neutral: generic examples/fixtures, no company-specific
  assumptions. License is **AGPL-3.0-only**; contributions are under the
  [CLA](CLA.md) (preserves dual/commercial licensing). Do not change the license
  without explicit direction.

## Testing model

Offline by default (`bun test` needs no infrastructure). Live suites are opt-in:

- `ATHENA_LOCAL_LIVE=1` → `test/e2e/live-stack.test.ts` (full Docker stack)
- `ATHENA_LOCAL_LIVE_EXTERNAL=1` → `test/e2e/external-stack.test.ts` (attach
  mode against an external MinIO; tests `s3://` and `s3a://`)
- runtime suites detect Docker / Apple `container` and otherwise skip
- the AWS suite round-trips real S3 only when explicitly enabled with a scoped
  development prefix

The proof of compatibility is an integration test that drives a real
`AthenaClient` (localhost endpoint, `us-east-1`, local creds) through the
facade.

## Commands

`bun install`, `bun run typecheck`, `bun run lint`, `bun run format[:check]`,
`bun run check:headers`, `bun test`, `bun run test:{unit,protocol,sqlite,integration,e2e,docker,apple-container,aws,package}`,
`bun run test:release` (the full gate), `bun run infra:{up,down,reset,status}`,
`bun run seed`, `bun run changeset`.

## Release & versioning

Changesets-driven. Add a changeset (`bun run changeset`) with every user-facing
change. On push to `main`, the **Changesets** workflow opens a "Version
Packages" PR; merging it tags the version (pushed with `RELEASE_TOKEN` so it
triggers CI), and the **Release** workflow publishes to npm via **OIDC Trusted
Publishing** (no stored token) with provenance, a CycloneDX SBOM, and a
build-provenance attestation. `prepublishOnly` runs `test:release` so even a
manual publish is gated. The package ships raw `src/` run by Bun
(`bin athena-local` → `./src/cli.ts`, `engines.bun >= 1.3.0`).

## Non-goals

Not a general AWS emulator. Out of scope: full Athena/Glue API coverage, IAM
policy evaluation, Lake Formation, KMS, Glue crawlers, billing, exact
bytes-scanned parity, federated connectors, complete workgroup enforcement,
every throttling behavior, full S3 emulation, and exact parity for every engine
edge case. Document unsupported behavior rather than silently approximating it.

## Authoritative docs

`README.md` (supported surface, matrix, limitations) · this file (consumer guide
+ working agreements) · `CHANGELOG.md` (shipped) · `CONTRIBUTING.md`
(release/secret setup). On conflict prefer: the user's latest explicit
instruction → `AGENTS.md` → `README.md`.
