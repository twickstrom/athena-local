// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import { describe, expect, test } from "bun:test";
import {
  interServiceConfigOptions,
  rewriteHostEndpoint,
} from "../../src/cli/run.ts";
import { resolveConfig } from "../../src/config/resolve.ts";
import { createLocalStackServices } from "../../src/infra/services.ts";

function config(env: Record<string, string | undefined>) {
  return resolveConfig({ env }).config;
}

describe("rewriteHostEndpoint", () => {
  test("rewrites only a localhost / 127.0.0.1 host, preserving port and path", () => {
    expect(rewriteHostEndpoint("http://localhost:9000", "10.0.0.1")).toEqual({
      endpoint: "http://10.0.0.1:9000",
      rewritten: true,
    });
    expect(
      rewriteHostEndpoint("http://127.0.0.1:9000/bucket", "10.0.0.1"),
    ).toEqual({ endpoint: "http://10.0.0.1:9000/bucket", rewritten: true });
  });

  test("leaves real hostnames and named services untouched", () => {
    for (const endpoint of [
      "https://s3.amazonaws.com",
      "http://minio:9000",
      "http://localhostlike:9000", // not a real localhost host
    ]) {
      expect(rewriteHostEndpoint(endpoint, "10.0.0.1")).toEqual({
        endpoint,
        rewritten: false,
      });
    }
  });
});

describe("interServiceConfigOptions", () => {
  test("apple container routes inter-service traffic through the gateway", () => {
    const options = interServiceConfigOptions(
      config({ ATHENA_LOCAL_CONTAINER_RUNTIME: "apple-container" }),
      "10.0.0.1",
      {},
    );
    expect(options).toEqual({
      postgresHost: "10.0.0.1",
      postgresPort: 5432,
      hiveMetastoreUri: "thrift://10.0.0.1:9083",
      minioEndpoint: "http://10.0.0.1:9000",
    });
  });

  test("docker bundled minio uses runtime-config defaults", () => {
    expect(
      interServiceConfigOptions(
        config({ ATHENA_LOCAL_CONTAINER_RUNTIME: "docker" }),
        "host.docker.internal",
        {},
      ),
    ).toEqual({});
  });

  test("external store: Trino endpoint is gateway-rewritten with external creds", () => {
    const options = interServiceConfigOptions(
      config({
        ATHENA_LOCAL_CONTAINER_RUNTIME: "apple-container",
        ATHENA_LOCAL_STORAGE_BACKEND: "external",
        ATHENA_LOCAL_S3_BUCKET: "briefcase-analytics",
        ATHENA_LOCAL_S3_ENDPOINT: "http://localhost:9000",
      }),
      "10.0.0.1",
      {
        ATHENA_LOCAL_S3_ACCESS_KEY: "minioadmin",
        ATHENA_LOCAL_S3_SECRET_KEY: "minioadmin",
      },
    );
    expect(options).toEqual({
      // External mode auto-defaults the catalog Postgres off host 5432.
      postgresHost: "10.0.0.1",
      postgresPort: 5433,
      hiveMetastoreUri: "thrift://10.0.0.1:9083",
      minioEndpoint: "http://10.0.0.1:9000",
      minioAccessKey: "minioadmin",
      minioSecretKey: "minioadmin",
    });
  });

  test("external store on docker reaches the host via host.docker.internal", () => {
    const options = interServiceConfigOptions(
      config({
        ATHENA_LOCAL_CONTAINER_RUNTIME: "docker",
        ATHENA_LOCAL_STORAGE_BACKEND: "external",
        ATHENA_LOCAL_S3_BUCKET: "briefcase-analytics",
        ATHENA_LOCAL_S3_ENDPOINT: "http://localhost:9000",
      }),
      "host.docker.internal",
      {},
    );
    expect(options).toEqual({
      minioEndpoint: "http://host.docker.internal:9000",
    });
  });
});

describe("createLocalStackServices bundledMinio", () => {
  test("omits MinIO and its dependency edges when not bundled", () => {
    const services = createLocalStackServices({ bundledMinio: false });
    const names = services.map((service) => service.name);
    expect(names).not.toContain("minio");
    expect(names).toEqual(["postgres", "hive-metastore", "trino"]);

    const hive = services.find((service) => service.name === "hive-metastore");
    const trino = services.find((service) => service.name === "trino");
    expect(hive?.dependsOn).toEqual(["postgres"]);
    expect(trino?.dependsOn).toEqual(["hive-metastore"]);
  });

  test("includes MinIO by default", () => {
    const services = createLocalStackServices();
    expect(services.map((service) => service.name)).toContain("minio");
  });
});
