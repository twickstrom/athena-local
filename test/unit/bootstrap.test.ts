// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import { describe, expect, test } from "bun:test";
import {
  createAthenaLocalHandler,
  resolveDefaultOutputLocation,
} from "../../src/server/bootstrap.ts";
import { resolveConfig } from "../../src/config/resolve.ts";

describe("resolveDefaultOutputLocation", () => {
  const configFor = (env: Record<string, string | undefined>) =>
    resolveConfig({ env }).config;

  test("external mode defaults results into the external bucket", () => {
    const env = {
      ATHENA_LOCAL_STORAGE_BACKEND: "external",
      ATHENA_LOCAL_S3_BUCKET: "analytics",
      ATHENA_LOCAL_S3_ENDPOINT: "http://localhost:9000",
    };
    expect(resolveDefaultOutputLocation(env, configFor(env))).toBe(
      "s3://analytics/athena-local-results/",
    );
  });

  test("external mode honors a configured prefix", () => {
    const env = {
      ATHENA_LOCAL_STORAGE_BACKEND: "external",
      ATHENA_LOCAL_S3_BUCKET: "analytics",
      ATHENA_LOCAL_S3_ENDPOINT: "http://localhost:9000",
      ATHENA_LOCAL_S3_PREFIX: "tenants/",
    };
    expect(resolveDefaultOutputLocation(env, configFor(env))).toBe(
      "s3://analytics/tenants/athena-local-results/",
    );
  });

  test("an explicit ATHENA_OUTPUT_LOCATION always wins", () => {
    const env = {
      ATHENA_LOCAL_STORAGE_BACKEND: "external",
      ATHENA_LOCAL_S3_BUCKET: "analytics",
      ATHENA_LOCAL_S3_ENDPOINT: "http://localhost:9000",
      ATHENA_OUTPUT_LOCATION: "s3://analytics/custom/",
    };
    expect(resolveDefaultOutputLocation(env, configFor(env))).toBe(
      "s3://analytics/custom/",
    );
  });

  test("minio mode keeps the bundled results bucket", () => {
    const env = { ATHENA_LOCAL_STORAGE_BACKEND: "minio" };
    expect(resolveDefaultOutputLocation(env, configFor(env))).toBe(
      "s3://athena-local-results/local/",
    );
  });
});

describe("server bootstrap", () => {
  test("validates unsafe AWS S3 configuration before creating handler", () => {
    expect(() =>
      createAthenaLocalHandler({
        env: {
          ATHENA_LOCAL_STORAGE_BACKEND: "s3",
          ATHENA_LOCAL_S3_BUCKET: "athena-local-dev",
          ATHENA_LOCAL_S3_PREFIX: "/",
        },
      }),
    ).toThrow("s3Prefix: AWS S3 prefix must not target a bucket root or parent path.");
  });

  test("creates a health-capable handler from local defaults", async () => {
    const bootstrap = createAthenaLocalHandler({
      env: {
        ATHENA_LOCAL_STORAGE_BACKEND: "minio",
        ATHENA_OUTPUT_LOCATION: "s3://athena-local-results/local/",
      },
    });

    const response = await bootstrap.handler(new Request("http://localhost/health"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      service: "athena-local",
    });

    bootstrap.close();
  });
});
