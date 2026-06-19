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

Versioning and changelog are driven by [Changesets](https://github.com/changesets/changesets);
publishing to npm uses **Trusted Publishing (OIDC)** — there is no long-lived npm
token in the repository.

Day to day:

1. With any user-facing change, add a changeset: `bun run changeset`, pick the
   bump (patch/minor/major), and write a short summary. Commit the generated
   `.changeset/*.md` file with your PR.
2. As changesets land on `main`, the **Changesets** workflow opens (and keeps
   updating) a "Version Packages" PR that applies the bumps and rewrites
   `CHANGELOG.md`.
3. Merge that PR to cut the release. CI tags the new version and pushes the tag,
   which triggers the **Release** workflow: it runs the full `test:release`
   gate, packs the tarball, generates a CycloneDX SBOM, attaches a
   build-provenance attestation, publishes to npm with provenance, and cuts a
   GitHub release.

`prepublishOnly` runs the same `test:release` gate, so even a manual
`npm publish` cannot ship a broken build. A `v<version>` tag still works for a
manual release, and **workflow_dispatch** on Release is a dry run that stops
before publish.

One-time maintainer setup (cannot be automated):

- **npm Trusted Publisher** — npmjs.com → the `athena-local` package →
  *Settings → Trusted Publishers* → add repository `twickstrom/athena-local`,
  workflow `release.yml`.
- **`RELEASE_TOKEN`** repository secret — a fine-grained PAT with Contents and
  Pull requests read/write, used by the Changesets workflow to push the release
  tag (the built-in token cannot trigger the Release workflow).
- **`CLA_SIGNATURES_TOKEN`** repository secret — a fine-grained PAT with
  Contents read/write, used by the CLA workflow to store signatures.

## Security

Do not include credentials, `.env` files, local databases, logs, generated runtime state, or private infrastructure details in issues or pull requests.

See [SECURITY.md](SECURITY.md) for vulnerability reporting.
