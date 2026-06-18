# Security Policy

Please do not report vulnerabilities by opening public issues that include secrets, exploit details, or private infrastructure data.

## Reporting A Vulnerability

Use GitHub private vulnerability reporting if enabled for the repository. If it is not enabled yet, contact the maintainer through a private channel listed on the repository owner's GitHub profile.

Include:

- affected version or commit
- reproduction steps
- impact
- whether credentials or remote AWS resources are involved
- suggested mitigation if known

## Sensitive Data

Never include:

- AWS credentials
- GitHub tokens
- `.env` files
- signed URLs
- private bucket names or production prefixes
- local SQLite databases
- logs containing credentials

## Security Scope

Security-sensitive areas include:

- remote AWS S3 deletion safeguards
- path traversal prevention
- shell injection prevention
- credential redaction
- package contents
- GitHub Actions release workflows
- npm publication provenance

## Supported Versions

Security fixes target the default branch.
