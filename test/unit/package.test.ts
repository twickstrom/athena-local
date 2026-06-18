import { describe, expect, test } from "bun:test";
import {
  packageName,
  plannedAthenaOperations,
  projectStatus,
} from "../../src/index.ts";

describe("package scaffold", () => {
  test("identifies the project without claiming runtime support", () => {
    expect(packageName).toBe("athena-local");
    expect(projectStatus).toBe("pre-alpha-planning");
  });

  test("documents the planned MVP Athena operations", () => {
    expect(plannedAthenaOperations).toEqual([
      "StartQueryExecution",
      "GetQueryExecution",
      "GetQueryResults",
      "StopQueryExecution",
    ]);
  });
});
