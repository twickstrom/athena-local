import { describe, expect, test } from "bun:test";
import { createRuntimePlanSummary } from "../../src/runtime/select.ts";

describe("runtime plan summaries", () => {
  test("summarizes Docker plans without executing commands", () => {
    expect(
      createRuntimePlanSummary({
        runtime: "docker",
        projectName: "athena-local",
        networkName: "athena-local",
      }),
    ).toEqual({
      runtime: "docker",
      serviceCount: 4,
      startCommandCount: 16,
      stopCommandCount: 4,
      destroyCommandCount: 8,
      services: ["postgres", "minio", "hive-metastore", "trino"],
    });
  });

  test("summarizes Apple container plans without executing commands", () => {
    expect(
      createRuntimePlanSummary({
        runtime: "apple-container",
        projectName: "athena-local",
        networkName: "athena-local",
      }),
    ).toEqual({
      runtime: "apple-container",
      serviceCount: 4,
      startCommandCount: 16,
      stopCommandCount: 4,
      destroyCommandCount: 8,
      services: ["postgres", "minio", "hive-metastore", "trino"],
    });
  });
});
