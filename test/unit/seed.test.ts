// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import { describe, expect, test } from "bun:test";
import {
  createDefaultSeedStatements,
  createTrinoSeedExecutor,
  seedLocalCatalog,
} from "../../src/seed/seed.ts";
import type { TrinoPage } from "../../src/trino/types.ts";

describe("seed system", () => {
  test("builds deterministic seed statements", () => {
    expect(createDefaultSeedStatements()).toEqual([
      "CREATE SCHEMA IF NOT EXISTS hive.default WITH (location = 's3a://athena-local/warehouse/default')",
      "CREATE TABLE IF NOT EXISTS hive.default.athena_local_smoke AS SELECT * FROM (VALUES (1, 'one'), (2, 'two'), (3, 'three')) AS t(id, label)",
    ]);
  });

  test("executes statements in order", async () => {
    const executed: string[] = [];
    const result = await seedLocalCatalog(
      {
        execute: async (sql) => {
          executed.push(sql);
        },
      },
      ["one", "two"],
    );

    expect(result.statements).toEqual(["one", "two"]);
    expect(executed).toEqual(["one", "two"]);
  });

  test("polls Trino until seed statement finishes", async () => {
    const fetched: string[] = [];
    const executor = createTrinoSeedExecutor({
      submit: async () => ({
        queryId: "query-1",
        nextUri: "next",
        page: page("RUNNING", "next"),
      }),
      fetchNext: async (nextUri) => {
        fetched.push(nextUri);
        return page("FINISHED");
      },
    });

    await executor.execute("select 1");

    expect(fetched).toEqual(["next"]);
  });

  test("raises Trino seed failures", async () => {
    const executor = createTrinoSeedExecutor({
      submit: async () => ({
        queryId: "query-1",
        page: {
          ...page("FAILED"),
          error: {
            message: "bad seed",
            errorName: "GENERIC_INTERNAL_ERROR",
            errorType: "USER_ERROR",
          },
        },
      }),
      fetchNext: async () => page("FINISHED"),
    });

    await expect(executor.execute("bad")).rejects.toThrow("bad seed");
  });
});

function page(state: string, nextUri?: string): TrinoPage {
  return {
    id: "query-1",
    stats: { state },
    ...(nextUri === undefined ? {} : { nextUri }),
  };
}
