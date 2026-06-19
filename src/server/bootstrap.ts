// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import type { AthenaFacadeConfig } from "../facade/service.ts";
import { AthenaFacadeService } from "../facade/service.ts";
import type { ConfigSources } from "../config/types.ts";
import { resolveConfig } from "../config/resolve.ts";
import { openStateDatabase } from "../state/database.ts";
import { QueryExecutionRepository } from "../state/repository.ts";
import { BunS3Storage, type BunS3StorageOptions } from "../storage/bun-s3.ts";
import { TrinoClient } from "../trino/client.ts";
import { createAthenaHttpHandler } from "./http.ts";

export interface BootstrapOptions {
  readonly env?: Record<string, string | undefined>;
  readonly sources?: Omit<ConfigSources, "cli" | "env">;
}

export interface BootstrapResult {
  readonly handler: (request: Request) => Promise<Response>;
  readonly close: () => void;
}

export function createAthenaLocalHandler(
  options: BootstrapOptions = {},
): BootstrapResult {
  const env = options.env ?? Bun.env;
  const resolved = resolveConfig({ ...options.sources, env });
  if (resolved.issues.length > 0) {
    throw new Error(
      resolved.issues
        .map((issue) => `${issue.field}: ${issue.message}`)
        .join("; "),
    );
  }

  const state = openStateDatabase(env.ATHENA_LOCAL_STATE_PATH ?? ":memory:");
  const repository = new QueryExecutionRepository(state.database);
  const facadeConfig = facadeConfigFromEnv(env);
  const output = parseOutputLocation(facadeConfig.defaultOutputLocation);
  const backend = resolved.config.storageBackend;
  const isMinio = backend === "minio";
  const isExternal = backend === "external";
  // The facade runs on the host, so it reaches an external store at its host
  // endpoint as-is (no gateway rewrite — that is only for in-container Trino).
  const endpoint = isMinio
    ? env.ATHENA_LOCAL_MINIO_ENDPOINT ??
      env.S3_ENDPOINT ??
      `http://127.0.0.1:${resolved.config.ports.minio}`
    : isExternal
      ? env.ATHENA_LOCAL_S3_ENDPOINT ?? resolved.config.s3Endpoint
      : env.AWS_ENDPOINT_URL_S3;
  // Credentials: MinIO defaults to built-in dev creds; external accepts explicit
  // keys (MinIO-style) and otherwise falls back to the AWS chain (real S3); the
  // s3 backend uses only explicitly provided credentials.
  const accessKeyId = isMinio
    ? env.AWS_ACCESS_KEY_ID ?? env.ATHENA_LOCAL_MINIO_ACCESS_KEY ?? "local"
    : isExternal
      ? env.ATHENA_LOCAL_S3_ACCESS_KEY ?? env.AWS_ACCESS_KEY_ID
      : env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = isMinio
    ? env.AWS_SECRET_ACCESS_KEY ?? env.ATHENA_LOCAL_MINIO_SECRET_KEY ?? "local-secret"
    : isExternal
      ? env.ATHENA_LOCAL_S3_SECRET_KEY ?? env.AWS_SECRET_ACCESS_KEY
      : env.AWS_SECRET_ACCESS_KEY;
  const storageOptions: BunS3StorageOptions = {
    kind: isMinio ? "minio" : "s3",
    bucket: output.bucket,
    region: resolved.config.awsRegion,
    ...optionalString("endpoint", endpoint),
    ...optionalString("accessKeyId", accessKeyId),
    ...optionalString("secretAccessKey", secretAccessKey),
    ...optionalString("sessionToken", env.AWS_SESSION_TOKEN),
  };
  const storage = new BunS3Storage(storageOptions);

  const trino = new TrinoClient({
    endpoint:
      env.TRINO_ENDPOINT ?? `http://127.0.0.1:${resolved.config.ports.trino}`,
    user: env.ATHENA_LOCAL_TRINO_USER ?? "athena-local",
    catalog: facadeConfig.trinoCatalog,
    schema: facadeConfig.defaultDatabase,
  });

  const service = new AthenaFacadeService({
    repository,
    trino,
    storage,
    clock: {
      now: () => Date.now(),
    },
    ids: {
      queryExecutionId: () => crypto.randomUUID(),
      clientRequestToken: () => crypto.randomUUID(),
    },
    config: facadeConfig,
  });

  return {
    handler: createAthenaHttpHandler({ handlers: service }),
    close: state.close,
  };
}

function facadeConfigFromEnv(
  env: Record<string, string | undefined>,
): AthenaFacadeConfig {
  const defaultCatalog = env.ATHENA_CATALOG ?? "AwsDataCatalog";
  return {
    defaultCatalog,
    // The Athena default catalog ("AwsDataCatalog") maps to the local Trino
    // catalog; everything else is assumed to be a real Trino catalog name.
    trinoCatalog:
      env.ATHENA_LOCAL_TRINO_CATALOG ??
      (defaultCatalog === "AwsDataCatalog" ? "hive" : defaultCatalog),
    defaultDatabase: env.ATHENA_DATABASE ?? "default",
    defaultWorkgroup: env.ATHENA_WORKGROUP ?? "primary",
    defaultOutputLocation:
      env.ATHENA_OUTPUT_LOCATION ??
      "s3://athena-local-results/local/",
  };
}

function parseOutputLocation(outputLocation: string): {
  readonly bucket: string;
} {
  const withoutScheme = outputLocation.startsWith("s3://")
    ? outputLocation.slice("s3://".length)
    : outputLocation;
  const bucket = withoutScheme.split("/")[0];
  if (bucket === undefined || bucket.length === 0) {
    throw new Error("ATHENA_OUTPUT_LOCATION must include an S3 bucket.");
  }
  return { bucket };
}

function optionalString<const K extends string>(
  key: K,
  value: string | undefined,
): { readonly [P in K]: string } | Record<string, never> {
  return value === undefined ? {} : { [key]: value } as { readonly [P in K]: string };
}
