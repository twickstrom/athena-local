# Contributing

Athena Local is pre-alpha. Contributions should keep scope narrow and preserve the core goal: applications use the real AWS SDK v3 clients locally and in production.

## Development Principles

- Use Bun for JavaScript and TypeScript execution.
- Keep TypeScript strict.
- Avoid Node-only native modules.
- Do not use DuckDB.
- Do not add a custom S3-compatible server.
- Add tests with behavior changes.
- Do not claim AWS compatibility without AWS SDK integration coverage.
- Document unsupported behavior clearly.

## Setup

```bash
bun install
bun run typecheck
bun test
```

## Pull Requests

Pull requests should include:

- clear motivation
- focused scope
- tests for changed behavior
- documentation updates when behavior or configuration changes
- notes for known compatibility limits

## Security

Do not include credentials, `.env` files, local databases, logs, generated runtime state, or private infrastructure details in issues or pull requests.

See [SECURITY.md](SECURITY.md) for vulnerability reporting.
