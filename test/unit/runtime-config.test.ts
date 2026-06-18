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
});
