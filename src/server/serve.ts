import type { AthenaOperationHandlers } from "../protocol/athena-types.ts";
import { createAthenaHttpHandler } from "./http.ts";

export interface ServeOptions {
  readonly port: number;
  readonly handlers: AthenaOperationHandlers;
}

export function serveAthenaLocal(options: ServeOptions): ReturnType<typeof Bun.serve> {
  return Bun.serve({
    port: options.port,
    fetch: createAthenaHttpHandler({
      handlers: options.handlers,
    }),
  });
}
