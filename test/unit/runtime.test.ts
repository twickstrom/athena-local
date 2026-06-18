// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import { describe, expect, test } from "bun:test";
import { validateServiceDefinition } from "../../src/runtime/types.ts";

describe("runtime service definitions", () => {
  test("accepts pinned service definitions", () => {
    const issues = validateServiceDefinition({
      name: "trino",
      image: "trinodb/trino:477",
      ports: [
        {
          name: "http",
          hostPort: 8080,
          containerPort: 8080,
          protocol: "tcp",
        },
      ],
      volumes: [],
      dependsOn: ["hive-metastore"],
      readiness: {
        type: "http",
        url: "http://127.0.0.1:8080/v1/info",
        timeoutMs: 30_000,
      },
    });

    expect(issues).toEqual([]);
  });

  test("rejects latest images and invalid ports", () => {
    const issues = validateServiceDefinition({
      name: "bad service",
      image: "minio/minio:latest",
      ports: [
        {
          name: "api",
          hostPort: 0,
          containerPort: 9000,
          protocol: "tcp",
        },
      ],
      volumes: [],
      dependsOn: [],
      readiness: {
        type: "tcp",
        host: "127.0.0.1",
        port: 9000,
        timeoutMs: 10_000,
      },
    });

    expect(issues).toEqual([
      "Service name must be a safe identifier.",
      "Service image must be pinned and must not use latest.",
      "Invalid port mapping: api.",
    ]);
  });
});
