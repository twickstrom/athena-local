---
"athena-local": patch
---

Fix stack boot on Docker Engine (Linux): the Hive and Trino config volumes used
a relative bind-mount source, which Docker Engine rejects as an invalid volume
name (it only worked on macOS runtimes that tolerate relative bind paths). The
service definitions now resolve config bind sources to absolute paths.
