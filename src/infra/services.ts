import { createCommandSpec } from "../process/command.ts";
import type { AthenaLocalConfig } from "../config/types.ts";
import type { RuntimeServiceDefinition } from "../runtime/types.ts";
import type { RuntimeConfigPaths } from "./runtime-config.ts";

export const localServiceImages = {
  minio: "quay.io/minio/minio:RELEASE.2025-04-22T22-12-26Z",
  postgres: "postgres:17.5-alpine",
  hiveMetastore: "apache/hive:4.0.1",
  trino: "trinodb/trino:477",
} as const;

export interface LocalStackServiceOptions {
  readonly configPaths?: RuntimeConfigPaths;
  readonly ports?: AthenaLocalConfig["ports"];
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
  return [
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
        HIVE_AUX_JARS_PATH: "/opt/hive/auxlib/postgresql.jar",
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
            path: configPaths.hiveConfigDir,
          },
          target: "/opt/hive/conf",
          readonly: true,
        },
      ],
      dependsOn: ["postgres", "minio"],
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
            path: configPaths.trinoConfigDir,
          },
          target: "/etc/trino",
          readonly: true,
        },
      ],
      dependsOn: ["hive-metastore", "minio"],
      readiness: {
        type: "http",
        url: `http://127.0.0.1:${ports.trino}/v1/info`,
        timeoutMs: 60_000,
      },
    },
  ];
}

export function createSelectOneReadinessCommand(): ReturnType<typeof createCommandSpec> {
  return createCommandSpec("trino", ["--execute", "SELECT 1"]);
}
