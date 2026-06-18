// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import { describe, expect, test } from "bun:test";
import {
  packageName,
  plannedAthenaOperations,
  projectVersion,
} from "../../src/index.ts";

describe("package scaffold", () => {
  test("identifies the package", () => {
    expect(packageName).toBe("athena-local");
    expect(projectVersion).toBe("0.0.0");
  });

  test("documents the supported Athena operation surface", () => {
    expect(plannedAthenaOperations).toEqual([
      "StartQueryExecution",
      "GetQueryExecution",
      "GetQueryResults",
      "StopQueryExecution",
    ]);
  });
});
