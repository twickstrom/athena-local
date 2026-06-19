// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  packageName,
  plannedAthenaOperations,
  projectVersion,
} from "../../src/index.ts";

describe("package scaffold", () => {
  test("identifies the package", () => {
    expect(packageName).toBe("athena-local");
    // The version is read from package.json at runtime, not hard-coded.
    const pkg = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    expect(projectVersion).toBe(pkg.version);
    expect(projectVersion).toMatch(/^\d+\.\d+\.\d+/);
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
