// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import { describe, expect, test } from "bun:test";
import { parseContainerState } from "../../src/runtime/status.ts";

describe("runtime status parsing", () => {
  test("parses Docker-style state objects", () => {
    expect(
      parseContainerState(
        "trino",
        JSON.stringify({ Status: "running", Health: { Status: "healthy" } }),
      ),
    ).toEqual({
      name: "trino",
      state: "running",
      healthy: true,
      message: "health=healthy",
    });
  });

  test("parses Apple container inspect arrays", () => {
    expect(parseContainerState("minio", JSON.stringify([{ status: "running" }]))).toEqual({
      name: "minio",
      state: "running",
      healthy: true,
    });
  });

  test("treats empty Apple inspect arrays as missing", () => {
    expect(parseContainerState("postgres", "[]")).toEqual({
      name: "postgres",
      state: "missing",
      healthy: false,
      message: "Container is missing.",
    });
  });
});
