// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

export const containerRuntimes = ["apple-container", "docker"] as const;
export type ContainerRuntime = (typeof containerRuntimes)[number];

export const storageBackends = ["minio", "s3"] as const;
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
