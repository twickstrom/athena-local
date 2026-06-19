// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareLocalRuntimeConfig } from "../../src/infra/runtime-config.ts";

describe("runtime config generation", () => {
  test("writes Trino and Hive configuration files", async () => {
    const root = mkdtempSync(join(tmpdir(), "athena-local-runtime-"));
    const paths = await prepareLocalRuntimeConfig({ root });

    expect(paths).toEqual({
      root,
      trinoConfigDir: join(root, "trino"),
      hiveConfigDir: join(root, "hive"),
    });
    await expect(Bun.file(join(paths.trinoConfigDir, "config.properties")).text()).resolves.toContain(
      "http-server.http.port=8080",
    );
    await expect(
      Bun.file(join(paths.trinoConfigDir, "catalog", "hive.properties")).text(),
    ).resolves.toContain("hive.metastore.uri=thrift://hive-metastore:9083");
    await expect(Bun.file(join(paths.hiveConfigDir, "hive-site.xml")).text()).resolves.toContain(
      "jdbc:postgresql://postgres:5432/metastore",
    );
  });

  test("routes inter-service addresses through a gateway when supplied", async () => {
    const root = mkdtempSync(join(tmpdir(), "athena-local-runtime-"));
    const paths = await prepareLocalRuntimeConfig({
      root,
      postgresHost: "10.88.0.1",
      postgresPort: 15432,
      minioEndpoint: "http://10.88.0.1:19000",
      hiveMetastoreUri: "thrift://10.88.0.1:19083",
    });

    await expect(
      Bun.file(join(paths.trinoConfigDir, "catalog", "hive.properties")).text(),
    ).resolves.toContain("hive.metastore.uri=thrift://10.88.0.1:19083");
    const hiveSite = await Bun.file(
      join(paths.hiveConfigDir, "hive-site.xml"),
    ).text();
    expect(hiveSite).toContain("jdbc:postgresql://10.88.0.1:15432/metastore");
    expect(hiveSite).toContain("http://10.88.0.1:19000");
  });

  test("maps the s3 scheme to S3A so the Metastore accepts s3:// locations", async () => {
    // Trino's native S3 handles s3://, but the Hive Metastore's Hadoop S3A only
    // registers s3a:// by default — so an external table at an s3:// location
    // (the scheme real Athena uses) fails without this mapping. Guard it.
    const root = mkdtempSync(join(tmpdir(), "athena-local-runtime-"));
    const paths = await prepareLocalRuntimeConfig({ root });
    const hiveSite = await Bun.file(
      join(paths.hiveConfigDir, "hive-site.xml"),
    ).text();
    expect(hiveSite).toContain(
      "<name>fs.s3.impl</name><value>org.apache.hadoop.fs.s3a.S3AFileSystem</value>",
    );
    expect(hiveSite).toContain("<name>fs.s3.access.key</name>");
    expect(hiveSite).toContain("<name>fs.s3.path.style.access</name>");
  });
});
