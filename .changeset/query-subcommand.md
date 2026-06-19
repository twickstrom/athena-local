---
"athena-local": patch
---

Add a `query` subcommand for end-to-end verification without writing SDK code:
`athena-local query "SELECT 1" [--database <name>] [--json]` runs a one-shot
StartQueryExecution → poll → GetQueryResults against the running facade over the
real AWS-JSON protocol and exits non-zero if the statement fails — a handy
CI/diagnostic primitive.
