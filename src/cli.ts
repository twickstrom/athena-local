#!/usr/bin/env bun

import { runCli } from "./cli/run.ts";

const result = runCli(Bun.argv.slice(2), {
  env: Bun.env,
  isTty: process.stdin.isTTY === true && process.stdout.isTTY === true,
});

if (result.stdout.length > 0) {
  console.log(result.stdout.trimEnd());
}

if (result.stderr.length > 0) {
  console.error(result.stderr.trimEnd());
}

process.exit(result.exitCode);
