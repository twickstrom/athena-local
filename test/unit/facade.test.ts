// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import { describe, expect, test } from "bun:test";
import { AthenaFacadeService } from "../../src/facade/service.ts";
import { openStateDatabase } from "../../src/state/database.ts";
import { QueryExecutionRepository } from "../../src/state/repository.ts";
import type {
  DeletePrefixScope,
  ObjectLocation,
  StorageBackend,
  StorageWriteInput,
} from "../../src/storage/types.ts";
import type { TrinoPage, TrinoQuerySubmission } from "../../src/trino/types.ts";

class FakeStorage implements StorageBackend {
  readonly kind = "minio";
  readonly writes: StorageWriteInput[] = [];

  async write(input: StorageWriteInput): Promise<void> {
    this.writes.push(input);
  }

  async read(_location: ObjectLocation): Promise<Uint8Array> {
    throw new Error("Not implemented in fake.");
  }

  async exists(_location: ObjectLocation): Promise<boolean> {
    return false;
  }

  async deletePrefix(_scope: DeletePrefixScope): Promise<void> {
    throw new Error("Not implemented in fake.");
  }
}

class FakeTrino {
  readonly submissions: string[] = [];
  readonly cancellations: string[] = [];
  submission: TrinoQuerySubmission;
  pages = new Map<string, TrinoPage>();

  constructor(submission: TrinoQuerySubmission) {
    this.submission = submission;
  }

  async submit(sql: string): Promise<TrinoQuerySubmission> {
    this.submissions.push(sql);
    return this.submission;
  }

  async fetchNext(nextUri: string): Promise<TrinoPage> {
    const page = this.pages.get(nextUri);
    if (page === undefined) {
      throw new Error(`Missing fake page: ${nextUri}`);
    }
    return page;
  }

  async cancel(nextUri: string): Promise<void> {
    this.cancellations.push(nextUri);
  }
}

function createService(trino: FakeTrino, storage = new FakeStorage()) {
  const state = openStateDatabase();
  const repository = new QueryExecutionRepository(state.database);
  let now = 100;
  let queryId = 1;
  let tokenId = 1;

  const service = new AthenaFacadeService({
    repository,
    trino,
    storage,
    clock: {
      now: () => {
        now += 10;
        return now;
      },
    },
    ids: {
      queryExecutionId: () => `query-${queryId++}`,
      clientRequestToken: () => `token-${tokenId++}`,
    },
    config: {
      defaultCatalog: "AwsDataCatalog",
      defaultDatabase: "default",
      defaultWorkgroup: "primary",
      defaultOutputLocation: "s3://athena-local-results/local/",
    },
  });

  return {
    service,
    repository,
    storage,
    close: state.close,
  };
}

describe("Athena facade service", () => {
  test("executes a query, persists results, and returns paginated rows", async () => {
    const trino = new FakeTrino({
      queryId: "trino-1",
      nextUri: "next-1",
      page: {
        id: "trino-1",
        nextUri: "next-1",
        stats: { state: "RUNNING" },
      },
    });
    trino.pages.set("next-1", {
      id: "trino-1",
      columns: [{ name: "value", type: "integer" }],
      data: [[1], [2]],
      stats: { state: "FINISHED", processedBytes: 12 },
    });
    const { service, repository, storage, close } = createService(trino);

    const started = await service.StartQueryExecution({
      QueryString: "select value from numbers",
      ClientRequestToken: "token-1",
    });

    expect(started).toEqual({ QueryExecutionId: "query-1" });
    expect(repository.findById("query-1")?.state).toBe("SUCCEEDED");
    expect(storage.writes).toHaveLength(1);
    expect(storage.writes[0]?.body).toBe("value\n1\n2\n");

    const execution = service.GetQueryExecution({
      QueryExecutionId: "query-1",
    });

    expect(execution.QueryExecution).toMatchObject({
      QueryExecutionId: "query-1",
      Status: { State: "SUCCEEDED" },
      ResultConfiguration: {
        OutputLocation: "s3://athena-local-results/local/query-1.csv",
      },
    });

    const firstPage = service.GetQueryResults({
      QueryExecutionId: "query-1",
      MaxResults: 2,
    });

    expect(firstPage.ResultSet).toMatchObject({
      Rows: [
        { Data: [{ VarCharValue: "value" }] },
        { Data: [{ VarCharValue: "1" }] },
      ],
    });
    expect(firstPage.NextToken).toBeDefined();
    if (firstPage.NextToken === undefined) {
      throw new Error("Expected NextToken.");
    }

    const secondPage = service.GetQueryResults({
      QueryExecutionId: "query-1",
      MaxResults: 2,
      NextToken: firstPage.NextToken,
    });

    expect(secondPage.ResultSet).toMatchObject({
      Rows: [{ Data: [{ VarCharValue: "2" }] }],
    });
    expect(secondPage.NextToken).toBeUndefined();

    close();
  });

  test("honors ClientRequestToken idempotency", async () => {
    const trino = new FakeTrino({
      queryId: "trino-1",
      page: {
        id: "trino-1",
        columns: [{ name: "value", type: "integer" }],
        data: [[1]],
        stats: { state: "FINISHED" },
      },
    });
    const { service, close } = createService(trino);

    const first = await service.StartQueryExecution({
      QueryString: "select 1",
      ClientRequestToken: "same-token",
    });
    const second = await service.StartQueryExecution({
      QueryString: "select 2",
      ClientRequestToken: "same-token",
    });

    expect(first.QueryExecutionId).toBe("query-1");
    expect(second.QueryExecutionId).toBe("query-1");
    expect(trino.submissions).toEqual(["select 1"]);

    close();
  });

  test("maps Trino errors to failed query state", async () => {
    const trino = new FakeTrino({
      queryId: "trino-1",
      page: {
        id: "trino-1",
        stats: { state: "FAILED" },
        error: {
          message: "Table not found",
          errorName: "TABLE_NOT_FOUND",
          errorType: "USER_ERROR",
        },
      },
    });
    const { service, repository, close } = createService(trino);

    await service.StartQueryExecution({
      QueryString: "select * from missing",
    });

    const record = repository.findById("query-1");
    expect(record?.state).toBe("FAILED");
    expect(record?.stateReason).toBe("Table not found");

    close();
  });

  test("throws Athena protocol errors for unknown IDs and unfinished results", async () => {
    const trino = new FakeTrino({
      queryId: "trino-1",
      page: {
        id: "trino-1",
        stats: { state: "RUNNING" },
      },
    });
    const { service, repository, close } = createService(trino);
    repository.createOrGetByToken({
      queryExecutionId: "queued",
      queryText: "select 1",
      submittedAt: 100,
    });

    expect(() =>
      service.GetQueryExecution({ QueryExecutionId: "missing" }),
    ).toThrow("Unknown query execution ID: missing");
    expect(() => service.GetQueryResults({ QueryExecutionId: "queued" })).toThrow(
      "Query has not completed successfully: QUEUED",
    );

    close();
  });

  test("cancels running Trino queries", async () => {
    const trino = new FakeTrino({
      queryId: "trino-1",
      page: {
        id: "trino-1",
        stats: { state: "RUNNING" },
      },
    });
    const { service, repository, close } = createService(trino);
    repository.createOrGetByToken({
      queryExecutionId: "query-1",
      queryText: "select sleep",
      submittedAt: 100,
    });
    repository.updateState("query-1", {
      state: "RUNNING",
      now: 110,
      trinoNextUri: "next-1",
    });

    await service.StopQueryExecution({ QueryExecutionId: "query-1" });

    expect(trino.cancellations).toEqual(["next-1"]);
    expect(repository.findById("query-1")?.state).toBe("CANCELLED");

    close();
  });
});
