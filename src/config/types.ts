// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

export const containerRuntimes = ["apple-container", "docker"] as const;
export type ContainerRuntime = (typeof containerRuntimes)[number];

// "minio": athena-local runs a bundled MinIO. "s3": real AWS S3 (credential
// chain, prefix-scoped). "external": attach to an external S3-compatible store
// (e.g. an existing MinIO) at an explicit endpoint+bucket — athena-local does
// not run its own object store and reads/writes data it does not own.
export const storageBackends = ["minio", "s3", "external"] as const;
export type StorageBackend = (typeof storageBackends)[number];

export const executionModes = ["test", "persistent"] as const;
export type ExecutionMode = (typeof executionModes)[number];

export const outputModes = ["text", "json"] as const;
export type OutputMode = (typeof outputModes)[number];

export interface AthenaLocalConfig {
  readonly containerRuntime?: ContainerRuntime;
  readonly storageBackend: StorageBackend;
  readonly executionMode: ExecutionMode;
  readonly projectId: string;
  readonly runId?: string;
  readonly awsProfile?: string;
  readonly awsRegion: string;
  readonly s3Bucket?: string;
  readonly s3Prefix?: string;
  // External S3-compatible endpoint (attach mode), as seen from the host.
  readonly s3Endpoint?: string;
  readonly ports: {
    readonly athena: number;
    readonly minio: number;
    readonly minioConsole: number;
    readonly trino: number;
    readonly hiveMetastore: number;
    readonly postgres: number;
  };
  readonly logLevel: "debug" | "info" | "warn" | "error";
  readonly outputMode: OutputMode;
}

export interface PartialAthenaLocalConfig {
  readonly containerRuntime?: unknown;
  readonly storageBackend?: unknown;
  readonly executionMode?: unknown;
  readonly projectId?: unknown;
  readonly runId?: unknown;
  readonly awsProfile?: unknown;
  readonly awsRegion?: unknown;
  readonly s3Bucket?: unknown;
  readonly s3Prefix?: unknown;
  readonly s3Endpoint?: unknown;
  readonly ports?: unknown;
  readonly logLevel?: unknown;
  readonly outputMode?: unknown;
}

export interface ConfigSources {
  readonly cli?: PartialAthenaLocalConfig;
  readonly env?: Record<string, string | undefined>;
  readonly localConfig?: PartialAthenaLocalConfig;
  readonly projectConfig?: PartialAthenaLocalConfig;
}

export interface ConfigIssue {
  readonly field: string;
  readonly message: string;
}

export interface ResolvedConfig {
  readonly config: AthenaLocalConfig;
  readonly issues: readonly ConfigIssue[];
}
