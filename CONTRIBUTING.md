# Contributing

Contributions should keep scope narrow and preserve the core goal: applications use the real AWS SDK v3 clients locally and in production.

## License & Contributor License Agreement

Athena Local is distributed under the **GNU Affero General Public License v3.0**
([LICENSE](LICENSE)). By contributing, you agree to the **[Contributor License
Agreement](CLA.md)**, which lets the maintainer offer the project under both the
AGPL and separate commercial terms. Acknowledge it in your first pull request as
described in [CLA.md](CLA.md). Contributions on behalf of an employer need the
Entity CLA — contact the maintainer first.

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

## Releasing

Releases publish to npm from CI using **Trusted Publishing (OIDC)** — there is no
long-lived npm token in the repository.

One-time maintainer setup on npmjs.com (cannot be automated):

1. Sign in at npmjs.com → the `athena-local` package → **Settings → Trusted
   Publishers** (for the very first publish, configure this against the org/user
   that will own the package).
2. Add a GitHub Actions publisher:
   - Repository: `twickstrom/athena-local`
   - Workflow filename: `release.yml`
   - Environment: leave blank.

To cut a release:

1. Bump `version` in `package.json` and update `CHANGELOG.md`.
2. Commit, then tag `v<version>` (the tag must match `package.json` exactly — the
   workflow fails the publish otherwise) and push the tag.
3. The `Release` workflow runs the full `test:release` gate, packs the tarball,
   generates a CycloneDX SBOM, attaches a build-provenance attestation, publishes
   to npm with provenance, and cuts a GitHub release with the SBOM and checksums.

`npm run` is not required locally: `prepublishOnly` runs the same `test:release`
gate, so even a manual `npm publish` cannot ship a broken or unchecked build.
Run `Release` via **workflow_dispatch** for a dry run that stops before publish.

## Security

Do not include credentials, `.env` files, local databases, logs, generated runtime state, or private infrastructure details in issues or pull requests.

See [SECURITY.md](SECURITY.md) for vulnerability reporting.
