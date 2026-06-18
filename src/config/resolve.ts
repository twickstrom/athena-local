import {
  containerRuntimes,
  type AthenaLocalConfig,
  type ConfigIssue,
  type ConfigSources,
  executionModes,
  outputModes,
  type PartialAthenaLocalConfig,
  type ResolvedConfig,
  storageBackends,
} from "./types.ts";

const defaultConfig: AthenaLocalConfig = {
  storageBackend: "minio",
  executionMode: "persistent",
  projectId: "athena-local",
  awsRegion: "us-east-1",
  ports: {
    athena: 4567,
    minio: 9000,
    minioConsole: 9001,
    trino: 8080,
    hiveMetastore: 9083,
    postgres: 5432,
  },
  logLevel: "info",
  outputMode: "text",
};

export function resolveConfig(sources: ConfigSources = {}): ResolvedConfig {
  const issues: ConfigIssue[] = [];
  const envConfig = configFromEnv(sources.env ?? {});
  const merged = mergePartialConfigs(
    defaultConfig,
    sources.projectConfig,
    sources.localConfig,
    envConfig,
    sources.cli,
  );

  const config = coerceConfig(merged, issues);
  validateConfig(config, issues);

  return { config, issues };
}

export function configFromEnv(
  env: Record<string, string | undefined>,
): PartialAthenaLocalConfig {
  return {
    containerRuntime: env.ATHENA_LOCAL_CONTAINER_RUNTIME,
    storageBackend: env.ATHENA_LOCAL_STORAGE_BACKEND,
    executionMode: env.ATHENA_LOCAL_EXECUTION_MODE,
    projectId: env.ATHENA_LOCAL_PROJECT_ID,
    runId: env.ATHENA_LOCAL_RUN_ID,
    awsProfile: env.AWS_PROFILE,
    awsRegion: env.AWS_REGION,
    s3Bucket: env.ATHENA_LOCAL_S3_BUCKET,
    s3Prefix: env.ATHENA_LOCAL_S3_PREFIX,
    outputMode: env.ATHENA_LOCAL_OUTPUT_MODE,
  };
}

export function redactConfig(config: AthenaLocalConfig): AthenaLocalConfig {
  if (config.awsProfile === undefined) {
    return config;
  }
  return {
    ...config,
    awsProfile: "[redacted]",
  };
}

function mergePartialConfigs(
  base: AthenaLocalConfig,
  ...configs: Array<PartialAthenaLocalConfig | undefined>
): PartialAthenaLocalConfig {
  let merged: PartialAthenaLocalConfig = base;

  for (const config of configs) {
    if (config === undefined) {
      continue;
    }
    merged = {
      ...merged,
      ...removeUndefined(config),
      ports: {
        ...asPortRecord(merged.ports),
        ...asPortRecord(config.ports),
      },
    };
  }

  return merged;
}

function coerceConfig(
  value: PartialAthenaLocalConfig,
  issues: ConfigIssue[],
): AthenaLocalConfig {
  return removeUndefined({
    containerRuntime: optionalEnum(
      "containerRuntime",
      value.containerRuntime,
      containerRuntimes,
      issues,
    ),
    storageBackend:
      optionalEnum("storageBackend", value.storageBackend, storageBackends, issues) ??
      defaultConfig.storageBackend,
    executionMode:
      optionalEnum("executionMode", value.executionMode, executionModes, issues) ??
      defaultConfig.executionMode,
    projectId:
      optionalString("projectId", value.projectId, issues) ??
      defaultConfig.projectId,
    runId: optionalString("runId", value.runId, issues),
    awsProfile: optionalString("awsProfile", value.awsProfile, issues),
    awsRegion:
      optionalString("awsRegion", value.awsRegion, issues) ??
      defaultConfig.awsRegion,
    s3Bucket: optionalString("s3Bucket", value.s3Bucket, issues),
    s3Prefix: optionalString("s3Prefix", value.s3Prefix, issues),
    ports: coercePorts(value.ports, issues),
    logLevel:
      optionalEnum(
        "logLevel",
        value.logLevel,
        ["debug", "info", "warn", "error"] as const,
        issues,
      ) ?? defaultConfig.logLevel,
    outputMode:
      optionalEnum("outputMode", value.outputMode, outputModes, issues) ??
      defaultConfig.outputMode,
  }) as AthenaLocalConfig;
}

function validateConfig(config: AthenaLocalConfig, issues: ConfigIssue[]): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(config.projectId)) {
    issues.push({
      field: "projectId",
      message:
        "Project ID must start with an alphanumeric character and contain only letters, numbers, dots, underscores, or dashes.",
    });
  }

  if (config.storageBackend === "s3") {
    if (config.s3Bucket === undefined || config.s3Bucket.length === 0) {
      issues.push({
        field: "s3Bucket",
        message: "AWS S3 storage requires ATHENA_LOCAL_S3_BUCKET.",
      });
    }

    if (config.s3Prefix === undefined || config.s3Prefix.length === 0) {
      issues.push({
        field: "s3Prefix",
        message: "AWS S3 storage requires a non-empty ATHENA_LOCAL_S3_PREFIX.",
      });
    } else if (isUnsafeRemotePrefix(config.s3Prefix)) {
      issues.push({
        field: "s3Prefix",
        message: "AWS S3 prefix must not target a bucket root or parent path.",
      });
    }
  }
}

function isUnsafeRemotePrefix(prefix: string): boolean {
  const normalized = prefix.trim();
  return (
    normalized === "" ||
    normalized === "/" ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("/") ||
    normalized.includes("../") ||
    normalized.includes("..\\")
  );
}

function coercePorts(
  value: unknown,
  issues: ConfigIssue[],
): AthenaLocalConfig["ports"] {
  const ports = {
    ...defaultConfig.ports,
    ...asPortRecord(value),
  };

  for (const [name, port] of Object.entries(ports)) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      issues.push({
        field: `ports.${name}`,
        message: "Port must be an integer between 1 and 65535.",
      });
    }
  }

  return ports;
}

function optionalString(
  field: string,
  value: unknown,
  issues: ConfigIssue[],
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    issues.push({ field, message: "Expected a string." });
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function optionalEnum<const T extends readonly string[]>(
  field: string,
  value: unknown,
  allowed: T,
  issues: ConfigIssue[],
): T[number] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !allowed.includes(value)) {
    issues.push({
      field,
      message: `Expected one of: ${allowed.join(", ")}.`,
    });
    return undefined;
  }
  return value;
}

function removeUndefined(
  value: PartialAthenaLocalConfig,
): PartialAthenaLocalConfig {
  return Object.fromEntries(
    Object.entries(value).filter((entry) => entry[1] !== undefined),
  ) as PartialAthenaLocalConfig;
}

function asPortRecord(value: unknown): Partial<AthenaLocalConfig["ports"]> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Partial<AthenaLocalConfig["ports"]>;
}
