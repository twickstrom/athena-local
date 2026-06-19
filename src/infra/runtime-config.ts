// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export interface RuntimeConfigPaths {
  readonly root: string;
  readonly trinoConfigDir: string;
  readonly hiveConfigDir: string;
}

export interface RuntimeConfigOptions {
  readonly root?: string;
  readonly minioEndpoint?: string;
  readonly minioAccessKey?: string;
  readonly minioSecretKey?: string;
  readonly warehouseLocation?: string;
  readonly postgresHost?: string;
  readonly postgresPort?: number;
  readonly postgresDatabase?: string;
  readonly postgresUser?: string;
  readonly postgresPassword?: string;
  // Inter-service addresses as Trino sees them. Defaults use Docker-style
  // service-name DNS (resolved via --network-alias). Apple container has no
  // such DNS, so the caller passes host-gateway addresses instead.
  readonly hiveMetastoreUri?: string;
}

export async function prepareLocalRuntimeConfig(
  options: RuntimeConfigOptions = {},
): Promise<RuntimeConfigPaths> {
  const root = options.root ?? ".athena-local/runtime";
  const trinoConfigDir = join(root, "trino");
  const trinoCatalogDir = join(trinoConfigDir, "catalog");
  const hiveConfigDir = join(root, "hive");

  await mkdir(trinoCatalogDir, { recursive: true });
  await mkdir(hiveConfigDir, { recursive: true });

  await Bun.write(join(trinoConfigDir, "config.properties"), trinoConfig());
  await Bun.write(join(trinoConfigDir, "node.properties"), trinoNode());
  await Bun.write(join(trinoConfigDir, "jvm.config"), trinoJvm());
  await Bun.write(
    join(trinoCatalogDir, "hive.properties"),
    trinoHiveCatalog(options),
  );
  await Bun.write(join(hiveConfigDir, "hive-site.xml"), hiveSiteXml(options));

  return {
    root,
    trinoConfigDir,
    hiveConfigDir,
  };
}

function trinoConfig(): string {
  return [
    "coordinator=true",
    "node-scheduler.include-coordinator=true",
    "http-server.http.port=8080",
    "discovery.uri=http://localhost:8080",
    "query.max-memory=1GB",
    "query.max-memory-per-node=512MB",
    "",
  ].join("\n");
}

function trinoNode(): string {
  // node.environment must match [a-z0-9][_a-z0-9]* (no hyphens).
  return ["node.environment=athena_local", "node.data-dir=/data/trino", ""].join(
    "\n",
  );
}

function trinoJvm(): string {
  return ["-server", "-Xmx1G", "-XX:+UseG1GC", ""].join("\n");
}

function trinoHiveCatalog(options: RuntimeConfigOptions): string {
  const endpoint = options.minioEndpoint ?? "http://minio:9000";
  const accessKey = options.minioAccessKey ?? "local";
  const secretKey = options.minioSecretKey ?? "local-secret";
  return [
    "connector.name=hive",
    `hive.metastore.uri=${options.hiveMetastoreUri ?? "thrift://hive-metastore:9083"}`,
    "fs.native-s3.enabled=true",
    `s3.endpoint=${endpoint}`,
    "s3.path-style-access=true",
    "s3.region=us-east-1",
    `s3.aws-access-key=${accessKey}`,
    `s3.aws-secret-key=${secretKey}`,
    "",
  ].join("\n");
}

function hiveSiteXml(options: RuntimeConfigOptions): string {
  const postgresHost = options.postgresHost ?? "postgres";
  const postgresPort = options.postgresPort ?? 5432;
  const database = options.postgresDatabase ?? "metastore";
  const user = options.postgresUser ?? "metastore";
  const password = options.postgresPassword ?? "metastore-local";
  const warehouse = options.warehouseLocation ?? "s3a://athena-local/warehouse";
  const endpoint = options.minioEndpoint ?? "http://minio:9000";
  const accessKey = options.minioAccessKey ?? "local";
  const secretKey = options.minioSecretKey ?? "local-secret";

  return `<?xml version="1.0"?>
<configuration>
  ${property("javax.jdo.option.ConnectionURL", `jdbc:postgresql://${postgresHost}:${postgresPort}/${database}`)}
  ${property("javax.jdo.option.ConnectionDriverName", "org.postgresql.Driver")}
  ${property("javax.jdo.option.ConnectionUserName", user)}
  ${property("javax.jdo.option.ConnectionPassword", password)}
  ${property("datanucleus.schema.autoCreateAll", "true")}
  ${property("hive.metastore.warehouse.dir", warehouse)}
  ${property("fs.s3a.endpoint", endpoint)}
  ${property("fs.s3a.path.style.access", "true")}
  ${property("fs.s3a.access.key", accessKey)}
  ${property("fs.s3a.secret.key", secretKey)}
  ${property("fs.s3.impl", "org.apache.hadoop.fs.s3a.S3AFileSystem")}
  ${property("fs.s3.endpoint", endpoint)}
  ${property("fs.s3.path.style.access", "true")}
  ${property("fs.s3.access.key", accessKey)}
  ${property("fs.s3.secret.key", secretKey)}
</configuration>
`;
}

function property(name: string, value: string): string {
  return `<property><name>${escapeXml(name)}</name><value>${escapeXml(value)}</value></property>`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
