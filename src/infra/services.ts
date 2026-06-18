import { createCommandSpec } from "../process/command.ts";
import type { RuntimeServiceDefinition } from "../runtime/types.ts";

export const localServiceImages = {
  minio: "quay.io/minio/minio:RELEASE.2025-04-22T22-12-26Z",
  postgres: "postgres:17.5-alpine",
  hiveMetastore: "apache/hive:4.0.1",
  trino: "trinodb/trino:477",
} as const;

export function createLocalStackServices(): readonly RuntimeServiceDefinition[] {
  return [
    {
      name: "postgres",
      image: localServiceImages.postgres,
      env: {
        POSTGRES_DB: "metastore",
        POSTGRES_USER: "metastore",
        POSTGRES_PASSWORD: "metastore-local",
      },
      ports: [
        {
          name: "postgres",
          hostPort: 5432,
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
        port: 5432,
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
          hostPort: 9000,
          containerPort: 9000,
          protocol: "tcp",
        },
        {
          name: "console",
          hostPort: 9001,
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
        url: "http://127.0.0.1:9000/minio/health/ready",
        timeoutMs: 30_000,
      },
    },
    {
      name: "hive-metastore",
      image: localServiceImages.hiveMetastore,
      env: {
        SERVICE_NAME: "metastore",
        DB_DRIVER: "postgres",
      },
      ports: [
        {
          name: "thrift",
          hostPort: 9083,
          containerPort: 9083,
          protocol: "tcp",
        },
      ],
      volumes: [],
      dependsOn: ["postgres", "minio"],
      readiness: {
        type: "tcp",
        host: "127.0.0.1",
        port: 9083,
        timeoutMs: 60_000,
      },
    },
    {
      name: "trino",
      image: localServiceImages.trino,
      ports: [
        {
          name: "http",
          hostPort: 8080,
          containerPort: 8080,
          protocol: "tcp",
        },
      ],
      volumes: [
        {
          name: "trino-config",
          target: "/etc/trino",
          readonly: true,
        },
      ],
      dependsOn: ["hive-metastore", "minio"],
      readiness: {
        type: "http",
        url: "http://127.0.0.1:8080/v1/info",
        timeoutMs: 60_000,
      },
    },
  ];
}

export function createSelectOneReadinessCommand(): ReturnType<typeof createCommandSpec> {
  return createCommandSpec("trino", ["--execute", "SELECT 1"]);
}
