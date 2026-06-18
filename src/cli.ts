#!/usr/bin/env bun

import { runCli } from "./cli/run.ts";
import { createAthenaLocalHandler } from "./server/bootstrap.ts";

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

if (result.action?.type === "serve-facade") {
  const bootstrap = createAthenaLocalHandler();
  const server = Bun.serve({
    port: result.action.port,
    fetch: bootstrap.handler,
  });

  console.log(`athena-local facade listening on http://127.0.0.1:${server.port}`);

  const shutdown = (): void => {
    bootstrap.close();
    server.stop();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  await new Promise(() => {});
}

process.exit(result.exitCode);
