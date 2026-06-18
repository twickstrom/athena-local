// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import { describe, expect, test } from "bun:test";
import { openStateDatabase } from "../../src/state/database.ts";
import { QueryExecutionRepository } from "../../src/state/repository.ts";
import {
  assertQueryStateTransition,
  recoverStateAfterRestart,
} from "../../src/state/transitions.ts";

describe("query execution state", () => {
  test("creates query records and returns idempotent token matches", () => {
    const state = openStateDatabase();
    const repository = new QueryExecutionRepository(state.database);

    const first = repository.createOrGetByToken({
      queryExecutionId: "query-1",
      clientRequestToken: "token-1",
      queryText: "select 1",
      submittedAt: 100,
    });

    const second = repository.createOrGetByToken({
      queryExecutionId: "query-2",
      clientRequestToken: "token-1",
      queryText: "select 2",
      submittedAt: 200,
    });

    expect(first.queryExecutionId).toBe("query-1");
    expect(second.queryExecutionId).toBe("query-1");
    expect(second.queryText).toBe("select 1");

    state.close();
  });

  test("updates lifecycle timestamps and terminal state", () => {
    const state = openStateDatabase();
    const repository = new QueryExecutionRepository(state.database);

    repository.createOrGetByToken({
      queryExecutionId: "query-1",
      queryText: "select 1",
      submittedAt: 100,
    });

    const running = repository.updateState("query-1", {
      state: "RUNNING",
      now: 150,
      trinoQueryId: "trino-1",
      trinoNextUri: "http://trino/query/1",
    });

    expect(running.startedAt).toBe(150);
    expect(running.completedAt).toBeUndefined();

    const succeeded = repository.updateState("query-1", {
      state: "SUCCEEDED",
      now: 250,
      resultS3Uri: "s3://athena-local-results/query-1.csv",
      resultRowCount: 2,
      scannedBytes: 42,
    });

    expect(succeeded.completedAt).toBe(250);
    expect(succeeded.resultRowCount).toBe(2);
    expect(succeeded.scannedBytes).toBe(42);

    state.close();
  });

  test("rejects invalid terminal transitions", () => {
    expect(() => assertQueryStateTransition("SUCCEEDED", "RUNNING")).toThrow(
      "Invalid query state transition: SUCCEEDED -> RUNNING",
    );
  });

  test("lists non-terminal records and recovers conservatively after restart", () => {
    const state = openStateDatabase();
    const repository = new QueryExecutionRepository(state.database);

    repository.createOrGetByToken({
      queryExecutionId: "queued",
      queryText: "select 1",
      submittedAt: 100,
    });
    repository.createOrGetByToken({
      queryExecutionId: "failed",
      queryText: "select bad",
      submittedAt: 200,
    });
    repository.updateState("failed", {
      state: "FAILED",
      now: 250,
      stateReason: "boom",
    });

    expect(repository.listNonTerminal().map((record) => record.queryExecutionId)).toEqual([
      "queued",
    ]);
    expect(recoverStateAfterRestart("RUNNING")).toEqual({
      state: "FAILED",
      stateReason: "Query did not reach a terminal state before local service restart.",
    });
    expect(recoverStateAfterRestart("FAILED")).toEqual({ state: "FAILED" });

    state.close();
  });
});
