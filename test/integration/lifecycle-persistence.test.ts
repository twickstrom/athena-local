// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AthenaFacadeService } from "../../src/facade/service.ts";
import { openStateDatabase } from "../../src/state/database.ts";
import { QueryExecutionRepository } from "../../src/state/repository.ts";
import { recoverStateAfterRestart } from "../../src/state/transitions.ts";
import { createFacadeHarness, FakeStorage, FakeTrino } from "../support/fakes.ts";

/**
 * Integration coverage for the facade wired to a real on-disk SQLite database.
 * These tests prove durability and restart behavior that an in-memory database
 * cannot: state and results survive a process restart, and non-terminal
 * executions are reconciled rather than silently resumed.
 */
describe("query lifecycle persistence", () => {
  let dir: string;
  let statePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "athena-local-state-"));
    statePath = join(dir, "state.sqlite");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("persists succeeded results across a simulated restart", async () => {
    const trino = new FakeTrino({
      queryId: "trino-1",
      nextUri: "next-1",
      page: { id: "trino-1", nextUri: "next-1", stats: { state: "RUNNING" } },
    });
    trino.pages.set("next-1", {
      id: "trino-1",
      columns: [{ name: "id", type: "integer" }],
      data: [[7]],
      stats: { state: "FINISHED", processedBytes: 5 },
    });

    // First "process": execute the query against the on-disk database.
    const first = createFacadeHarness({ trino, statePath });
    const started = await first.service.StartQueryExecution({
      QueryString: "select 7",
    });
    expect(first.repository.findById(started.QueryExecutionId!)?.state).toBe(
      "SUCCEEDED",
    );
    first.close();

    // Second "process": reopen the same database file with fresh objects.
    const reopened = openStateDatabase(statePath);
    const repository = new QueryExecutionRepository(reopened.database);
    const service = new AthenaFacadeService({
      repository,
      trino,
      storage: new FakeStorage(),
      clock: { now: () => 1_000 },
      ids: {
        queryExecutionId: () => "unused",
        clientRequestToken: () => "unused",
      },
      config: {
        defaultCatalog: "AwsDataCatalog",
        trinoCatalog: "hive",
        defaultDatabase: "default",
        defaultWorkgroup: "primary",
        defaultOutputLocation: "s3://athena-local-results/local/",
      },
    });

    const execution = service.GetQueryExecution({
      QueryExecutionId: started.QueryExecutionId!,
    });
    const status = (execution.QueryExecution as { Status: { State: string } })
      .Status;
    expect(status.State).toBe("SUCCEEDED");

    const results = service.GetQueryResults({
      QueryExecutionId: started.QueryExecutionId!,
    });
    const rows = (
      results.ResultSet as {
        Rows: { Data: { VarCharValue?: string }[] }[];
      }
    ).Rows;
    expect(rows[1]?.Data?.[0]?.VarCharValue).toBe("7");

    reopened.close();
  });

  test("reconciles a non-terminal execution left behind by a restart", () => {
    const opened = openStateDatabase(statePath);
    const repository = new QueryExecutionRepository(opened.database);
    repository.createOrGetByToken({
      queryExecutionId: "abandoned",
      queryText: "select 1",
      submittedAt: 1,
    });
    repository.updateState("abandoned", { state: "RUNNING", now: 2 });
    opened.close();

    // Restart: a RUNNING query with no resumable handle must not be reported
    // as if it were still progressing.
    const reopened = openStateDatabase(statePath);
    const repo = new QueryExecutionRepository(reopened.database);
    const nonTerminal = repo.listNonTerminal();
    expect(nonTerminal.map((record) => record.queryExecutionId)).toEqual([
      "abandoned",
    ]);

    const recovered = recoverStateAfterRestart(nonTerminal[0]!.state);
    expect(recovered.state).toBe("FAILED");
    repo.updateState("abandoned", {
      state: recovered.state,
      now: 3,
      ...(recovered.stateReason === undefined
        ? {}
        : { stateReason: recovered.stateReason }),
    });
    expect(repo.findById("abandoned")?.state).toBe("FAILED");

    reopened.close();
  });

  test("cancels a running query through StopQueryExecution", async () => {
    const trino = new FakeTrino({
      queryId: "trino-1",
      page: { id: "trino-1", stats: { state: "RUNNING" } },
    });
    const harness = createFacadeHarness({ trino, statePath });
    harness.repository.createOrGetByToken({
      queryExecutionId: "running-1",
      queryText: "select * from big_table",
      submittedAt: 1,
    });
    harness.repository.updateState("running-1", {
      state: "RUNNING",
      now: 2,
      trinoNextUri: "https://trino.local/v1/statement/running-1/1",
    });

    await harness.service.StopQueryExecution({ QueryExecutionId: "running-1" });

    expect(trino.cancellations).toEqual([
      "https://trino.local/v1/statement/running-1/1",
    ]);
    const record = harness.repository.findById("running-1");
    expect(record?.state).toBe("CANCELLED");
    expect(record?.stateReason).toContain("cancelled");

    harness.close();
  });
});
