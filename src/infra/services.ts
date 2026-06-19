// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import { resolve } from "node:path";
import { createCommandSpec } from "../process/command.ts";
import type { AthenaLocalConfig } from "../config/types.ts";
import type { RuntimeServiceDefinition } from "../runtime/types.ts";
import type { RuntimeConfigPaths } from "./runtime-config.ts";

// Pinned by digest so a re-tagged upstream image can't change what boots. The
// tag stays for readability and is the source of truth for the version; the
// @sha256 is the exact manifest. Renovate keeps both in lockstep — when bumping
// a tag by hand, refresh the digest with:
//   docker buildx imagetools inspect <ref> --format '{{.Manifest.Digest}}'
export const localServiceImages = {
  minio:
    "quay.io/minio/minio:RELEASE.2025-04-22T22-12-26Z@sha256:a1ea29fa28355559ef137d71fc570e508a214ec84ff8083e39bc5428980b015e",
  postgres:
    "postgres:17.5-alpine@sha256:6567bca8d7bc8c82c5922425a0baee57be8402df92bae5eacad5f01ae9544daa",
  hiveMetastore:
    "apache/hive:4.0.1@sha256:5194161ef50b80875f937dff04936df047cbe894e9727ab8f0606349345b1bd3",
  trino:
    "trinodb/trino:477@sha256:ada485e4bffb90f859b401dc04c393d147b5840846ef66b27110662eb2675854",
} as const;

export interface LocalStackServiceOptions {
  readonly configPaths?: RuntimeConfigPaths;
  readonly ports?: AthenaLocalConfig["ports"];
  // Whether to run the bundled MinIO. False for the s3/external backends, which
  // attach to an object store athena-local does not own.
  readonly bundledMinio?: boolean;
}

const defaultPorts: AthenaLocalConfig["ports"] = {
  athena: 4567,
  minio: 9000,
  minioConsole: 9001,
  trino: 8080,
  hiveMetastore: 9083,
  postgres: 5432,
};

export function createLocalStackServices(
  options: LocalStackServiceOptions = {},
): readonly RuntimeServiceDefinition[] {
  const configPaths = options.configPaths ?? {
    root: ".athena-local/runtime",
    trinoConfigDir: ".athena-local/runtime/trino",
    hiveConfigDir: ".athena-local/runtime/hive",
  };
  const ports = options.ports ?? defaultPorts;
  const bundledMinio = options.bundledMinio ?? true;
  const services: readonly RuntimeServiceDefinition[] = [
    {
      name: "postgres",
      image: localServiceImages.postgres,
      env: {
        POSTGRES_DB: "metastore",
        POSTGRES_USER: "metastore",
        POSTGRES_PASSWORD: "metastore-local",
        PGDATA: "/var/lib/postgresql/data/pgdata",
      },
      ports: [
        {
          name: "postgres",
          hostPort: ports.postgres,
          containerPort: 5432,
          protocol: "tcp",
        },
      ],
      volumes: [
        {
          name: "postgres-data",
          target: "/var/lib/postgresql/data",
        },
      ],
      dependsOn: [],
      readiness: {
        type: "tcp",
        host: "127.0.0.1",
        port: ports.postgres,
        timeoutMs: 30_000,
      },
    },
    {
      name: "minio",
      image: localServiceImages.minio,
      command: ["server", "/data", "--console-address", ":9001"],
      env: {
        MINIO_ROOT_USER: "local",
        MINIO_ROOT_PASSWORD: "local-secret",
      },
      ports: [
        {
          name: "api",
          hostPort: ports.minio,
          containerPort: 9000,
          protocol: "tcp",
        },
        {
          name: "console",
          hostPort: ports.minioConsole,
          containerPort: 9001,
          protocol: "tcp",
        },
      ],
      volumes: [
        {
          name: "minio-data",
          target: "/data",
        },
      ],
      dependsOn: [],
      readiness: {
        type: "http",
        url: `http://127.0.0.1:${ports.minio}/minio/health/ready`,
        timeoutMs: 30_000,
      },
    },
    {
      name: "hive-metastore",
      image: localServiceImages.hiveMetastore,
      initTasks: [
        {
          image: localServiceImages.trino,
          command: [
            "cp",
            "/usr/lib/trino/plugin/postgresql/org.postgresql_postgresql-42.7.8.jar",
            "/hive-auxlib/postgresql.jar",
          ],
          volumes: [
            {
              name: "hive-auxlib",
              target: "/hive-auxlib",
            },
          ],
        },
      ],
      env: {
        SERVICE_NAME: "metastore",
        DB_DRIVER: "postgres",
        // The PostgreSQL JDBC driver (copied in by the init task) plus the
        // hadoop-aws S3A filesystem and AWS SDK bundle, which ship in the Hive
        // image but outside the default classpath. The metastore needs S3A to
        // create database/table directories on object storage (s3a:// scheme).
        HIVE_AUX_JARS_PATH: [
          "/opt/hive/auxlib/postgresql.jar",
          "/opt/hadoop/share/hadoop/tools/lib/hadoop-aws-3.3.6.jar",
          "/opt/hadoop/share/hadoop/tools/lib/aws-java-sdk-bundle-1.12.367.jar",
        ].join(":"),
      },
      ports: [
        {
          name: "thrift",
          hostPort: ports.hiveMetastore,
          containerPort: 9083,
          protocol: "tcp",
        },
      ],
      volumes: [
        {
          name: "hive-auxlib",
          target: "/opt/hive/auxlib",
          readonly: true,
        },
        {
          name: "hive-config",
          source: {
            type: "bind",
            // Docker Engine requires an absolute bind source; a relative path is
            // rejected as an invalid volume name. resolve() leaves an already
            // absolute path unchanged.
            path: resolve(configPaths.hiveConfigDir),
          },
          target: "/opt/hive/conf",
          readonly: true,
        },
      ],
      dependsOn: bundledMinio ? ["postgres", "minio"] : ["postgres"],
      readiness: {
        type: "tcp",
        host: "127.0.0.1",
        port: ports.hiveMetastore,
        timeoutMs: 60_000,
      },
    },
    {
      name: "trino",
      image: localServiceImages.trino,
      ports: [
        {
          name: "http",
          hostPort: ports.trino,
          containerPort: 8080,
          protocol: "tcp",
        },
      ],
      volumes: [
        {
          name: "trino-config",
          source: {
            type: "bind",
            path: resolve(configPaths.trinoConfigDir),
          },
          target: "/etc/trino",
          readonly: true,
        },
      ],
      dependsOn: bundledMinio ? ["hive-metastore", "minio"] : ["hive-metastore"],
      readiness: {
        type: "http",
        url: `http://127.0.0.1:${ports.trino}/v1/info`,
        // /v1/info returns 200 with "starting":true during warmup; require the
        // coordinator to finish starting so it can actually serve queries.
        expectBodyIncludes: '"starting":false',
        timeoutMs: 180_000,
      },
    },
  ];

  return bundledMinio
    ? services
    : services.filter((service) => service.name !== "minio");
}

export function createSelectOneReadinessCommand(): ReturnType<typeof createCommandSpec> {
  return createCommandSpec("trino", ["--execute", "SELECT 1"]);
}
