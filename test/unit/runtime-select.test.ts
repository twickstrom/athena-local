import { describe, expect, test } from "bun:test";
import {
  createRuntimeCommandPlan,
  createRuntimePlanSummary,
} from "../../src/runtime/select.ts";

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
      startCommandCount: 18,
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
      startCommandCount: 18,
      stopCommandCount: 4,
      destroyCommandCount: 8,
      services: ["postgres", "minio", "hive-metastore", "trino"],
    });
  });

  test("creates redacted runtime command plans", () => {
    const plan = createRuntimeCommandPlan({
      runtime: "docker",
      command: "start",
      projectName: "athena-local",
      networkName: "athena-local",
      redact: true,
    });

    expect(plan.runtime).toBe("docker");
    expect(plan.command).toBe("start");
    expect(plan.commands).toHaveLength(18);
    expect(JSON.stringify(plan.commands)).not.toContain("minioadmin");
    expect(JSON.stringify(plan.commands)).toContain("MINIO_ROOT_PASSWORD=[redacted]");
  });

  test("composes reset from destroy followed by start", () => {
    const reset = createRuntimeCommandPlan({
      runtime: "apple-container",
      command: "reset",
      projectName: "athena-local",
      networkName: "athena-local",
    });

    expect(reset.commands).toHaveLength(26);
    expect(reset.commands[0]).toEqual({
      executable: "container",
      args: ["rm", "--force", "athena-local-postgres"],
      allowFailure: true,
    });
    expect(reset.commands[8]).toEqual({
      executable: "container",
      args: ["network", "create", "athena-local"],
    });
  });
});
