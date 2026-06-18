#!/usr/bin/env bun

import { createAthenaLocalHandler } from "./bootstrap.ts";

const port = Number(Bun.env.ATHENA_LOCAL_PORT ?? Bun.env.PORT ?? 4567);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("ATHENA_LOCAL_PORT must be an integer between 1 and 65535.");
}

const bootstrap = createAthenaLocalHandler();
const server = Bun.serve({
  port,
  fetch: bootstrap.handler,
});

console.log(`athena-local listening on http://127.0.0.1:${server.port}`);

function shutdown(): void {
  bootstrap.close();
  server.stop();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
