// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import { describe, expect, test } from "bun:test";
import {
  validateDeletePrefix,
  validateObjectLocation,
} from "../../src/storage/safety.ts";

describe("storage safety", () => {
  test("accepts scoped object locations", () => {
    expect(
      validateObjectLocation({
        bucket: "athena-local-dev",
        key: "fixtures/query-results/result.csv",
      }),
    ).toEqual([]);
  });

  test("rejects traversal in object keys", () => {
    expect(
      validateObjectLocation({
        bucket: "athena-local-dev",
        key: "../prod/secrets.csv",
      }),
    ).toContainEqual({
      field: "key",
      message: "Object key must be relative and must not contain traversal.",
    });
  });

  test("requires force for remote deletion", () => {
    expect(
      validateDeletePrefix({
        bucket: "athena-local-dev",
        prefix: "athena-local/run-123/",
        remote: true,
        force: false,
      }),
    ).toContainEqual({
      field: "force",
      message: "Remote deletion requires explicit force.",
    });
  });

  test("rejects root-level destructive prefixes", () => {
    expect(
      validateDeletePrefix({
        bucket: "athena-local-dev",
        prefix: "/",
        remote: true,
        force: true,
      }),
    ).toContainEqual({
      field: "prefix",
      message: "Prefix must be non-empty, relative, and scoped below bucket root.",
    });
  });
});
