// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import { describe, expect, test } from "bun:test";
import { resolveConfig } from "../../src/config/resolve.ts";

describe("configuration resolution", () => {
  test("uses defaults when no sources are provided", () => {
    const resolved = resolveConfig();

    expect(resolved.issues).toEqual([]);
    expect(resolved.config.storageBackend).toBe("minio");
    expect(resolved.config.executionMode).toBe("persistent");
    expect(resolved.config.awsRegion).toBe("us-east-1");
    expect(resolved.config.ports.athena).toBe(4567);
  });

  test("applies precedence from project to local to environment to CLI", () => {
    const resolved = resolveConfig({
      projectConfig: {
        storageBackend: "minio",
        projectId: "project-file",
        awsRegion: "us-west-2",
      },
      localConfig: {
        projectId: "local-file",
      },
      env: {
        ATHENA_LOCAL_PROJECT_ID: "from-env",
        AWS_REGION: "eu-west-1",
      },
      cli: {
        projectId: "from-cli",
      },
    });

    expect(resolved.issues).toEqual([]);
    expect(resolved.config.projectId).toBe("from-cli");
    expect(resolved.config.awsRegion).toBe("eu-west-1");
    expect(resolved.config.storageBackend).toBe("minio");
  });

  test("requires bucket and safe non-empty prefix for AWS S3 storage", () => {
    const missing = resolveConfig({
      cli: {
        storageBackend: "s3",
      },
    });

    expect(missing.issues.map((issue) => issue.field)).toEqual([
      "s3Bucket",
      "s3Prefix",
    ]);

    const unsafe = resolveConfig({
      cli: {
        storageBackend: "s3",
        s3Bucket: "example-dev",
        s3Prefix: "/",
      },
    });

    expect(unsafe.issues).toContainEqual({
      field: "s3Prefix",
      message: "AWS S3 prefix must not target a bucket root or parent path.",
    });

    const safe = resolveConfig({
      cli: {
        storageBackend: "s3",
        s3Bucket: "example-dev",
        s3Prefix: "athena-local/dev/",
      },
    });

    expect(safe.issues).toEqual([]);
  });

  test("validates enum fields and ports", () => {
    const resolved = resolveConfig({
      cli: {
        containerRuntime: "podman",
        ports: {
          athena: 70000,
        },
      },
    });

    expect(resolved.issues).toContainEqual({
      field: "containerRuntime",
      message: "Expected one of: apple-container, docker.",
    });
    expect(resolved.issues).toContainEqual({
      field: "ports.athena",
      message: "Port must be an integer between 1 and 65535.",
    });
  });

  test("applies environment port overrides", () => {
    const resolved = resolveConfig({
      env: {
        ATHENA_LOCAL_PORT_ATHENA: "14567",
        ATHENA_LOCAL_PORT_MINIO: "19000",
        ATHENA_LOCAL_PORT_MINIO_CONSOLE: "19001",
        ATHENA_LOCAL_PORT_TRINO: "18080",
        ATHENA_LOCAL_PORT_HIVE_METASTORE: "19083",
        ATHENA_LOCAL_PORT_POSTGRES: "15432",
      },
    });

    expect(resolved.issues).toEqual([]);
    expect(resolved.config.ports).toEqual({
      athena: 14567,
      minio: 19000,
      minioConsole: 19001,
      trino: 18080,
      hiveMetastore: 19083,
      postgres: 15432,
    });
  });
});
