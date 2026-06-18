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
  const isMinio = resolved.config.storageBackend === "minio";
  const storageOptions: BunS3StorageOptions = {
    kind: resolved.config.storageBackend,
    bucket: output.bucket,
    region: resolved.config.awsRegion,
    ...optionalString(
      "endpoint",
      isMinio
        ? env.ATHENA_LOCAL_MINIO_ENDPOINT ??
            env.S3_ENDPOINT ??
            `http://127.0.0.1:${resolved.config.ports.minio}`
        : env.AWS_ENDPOINT_URL_S3,
    ),
    // For the local MinIO backend, default to the stack's built-in development
    // credentials so the facade works out of the box; explicit env still wins.
    // For the AWS S3 backend, only use explicitly provided credentials.
    ...optionalString(
      "accessKeyId",
      isMinio
        ? env.AWS_ACCESS_KEY_ID ?? env.ATHENA_LOCAL_MINIO_ACCESS_KEY ?? "local"
        : env.AWS_ACCESS_KEY_ID,
    ),
    ...optionalString(
      "secretAccessKey",
      isMinio
        ? env.AWS_SECRET_ACCESS_KEY ??
            env.ATHENA_LOCAL_MINIO_SECRET_KEY ??
            "local-secret"
        : env.AWS_SECRET_ACCESS_KEY,
    ),
    ...optionalString("sessionToken", env.AWS_SESSION_TOKEN),
  };
  const storage = new BunS3Storage(storageOptions);

  const trino = new TrinoClient({
    endpoint:
      env.TRINO_ENDPOINT ?? `http://127.0.0.1:${resolved.config.ports.trino}`,
    user: env.ATHENA_LOCAL_TRINO_USER ?? "athena-local",
    catalog: facadeConfig.defaultCatalog === "AwsDataCatalog"
      ? "hive"
      : facadeConfig.defaultCatalog,
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
  return {
    defaultCatalog: env.ATHENA_CATALOG ?? "AwsDataCatalog",
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
