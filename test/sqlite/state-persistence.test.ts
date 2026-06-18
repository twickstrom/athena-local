import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStateDatabase } from "../../src/state/database.ts";
import { QueryExecutionRepository } from "../../src/state/repository.ts";

/**
 * Storage-layer tests against a real on-disk SQLite database. These verify the
 * durability and integrity guarantees the facade relies on: idempotent inserts,
 * persisted state transitions across reopen, terminal immutability, and WAL
 * journaling for file-backed databases.
 */
describe("query execution state persistence", () => {
  let dir: string;
  let statePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "athena-local-sqlite-"));
    statePath = join(dir, "state.sqlite");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("createOrGetByToken is idempotent for a repeated client request token", () => {
    const opened = openStateDatabase(statePath);
    const repository = new QueryExecutionRepository(opened.database);

    const first = repository.createOrGetByToken({
      queryExecutionId: "query-1",
      clientRequestToken: "token-a",
      queryText: "select 1",
      submittedAt: 10,
    });
    const second = repository.createOrGetByToken({
      queryExecutionId: "query-2",
      clientRequestToken: "token-a",
      queryText: "select 1",
      submittedAt: 20,
    });

    expect(second.queryExecutionId).toBe(first.queryExecutionId);
    expect(repository.listNonTerminal()).toHaveLength(1);

    opened.close();
  });

  test("uses WAL journaling for file-backed databases", () => {
    const opened = openStateDatabase(statePath);
    const mode = opened.database
      .query<{ journal_mode: string }, []>("PRAGMA journal_mode")
      .get();
    expect(mode?.journal_mode.toLowerCase()).toBe("wal");
    opened.close();
  });

  test("persists state transitions and result payloads across reopen", () => {
    const opened = openStateDatabase(statePath);
    const repository = new QueryExecutionRepository(opened.database);
    repository.createOrGetByToken({
      queryExecutionId: "query-1",
      queryText: "select 1",
      submittedAt: 10,
    });
    repository.updateState("query-1", { state: "RUNNING", now: 20 });
    repository.updateState("query-1", {
      state: "SUCCEEDED",
      now: 30,
      resultS3Uri: "s3://athena-local-results/local/query-1.csv",
      resultRowsJson: JSON.stringify([{ Data: [{ VarCharValue: "1" }] }]),
      resultRowCount: 1,
      scannedBytes: 8,
    });
    opened.close();

    const reopened = openStateDatabase(statePath);
    const repository2 = new QueryExecutionRepository(reopened.database);
    const record = repository2.findById("query-1");

    expect(record?.state).toBe("SUCCEEDED");
    expect(record?.startedAt).toBe(20);
    expect(record?.completedAt).toBe(30);
    expect(record?.scannedBytes).toBe(8);
    expect(record?.resultS3Uri).toBe(
      "s3://athena-local-results/local/query-1.csv",
    );
    expect(repository2.listNonTerminal()).toHaveLength(0);

    reopened.close();
  });

  test("rejects transitions out of a terminal state", () => {
    const opened = openStateDatabase(statePath);
    const repository = new QueryExecutionRepository(opened.database);
    repository.createOrGetByToken({
      queryExecutionId: "query-1",
      queryText: "select 1",
      submittedAt: 10,
    });
    repository.updateState("query-1", { state: "SUCCEEDED", now: 20 });

    expect(() =>
      repository.updateState("query-1", { state: "RUNNING", now: 30 }),
    ).toThrow("Invalid query state transition: SUCCEEDED -> RUNNING");

    opened.close();
  });
});
