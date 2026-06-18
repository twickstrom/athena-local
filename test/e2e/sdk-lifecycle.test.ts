import { describe, expect, test } from "bun:test";
import {
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  StartQueryExecutionCommand,
} from "@aws-sdk/client-athena";
import { createFacadeHarness, createSdkClient, FakeTrino } from "../support/fakes.ts";

/**
 * End-to-end coverage of the application path that matters most: a real AWS
 * SDK v3 `AthenaClient` talking to the real `AthenaFacadeService` over the
 * Athena wire protocol. Only Trino and object storage are faked; the SDK
 * serialization, HTTP routing, facade engine, state machine, result
 * materialization, and pagination are all exercised exactly as in production.
 */
describe("AthenaClient end-to-end lifecycle", () => {
  test("starts a query, reports SUCCEEDED, and pages through results", async () => {
    const trino = new FakeTrino({
      queryId: "trino-1",
      nextUri: "next-1",
      page: { id: "trino-1", nextUri: "next-1", stats: { state: "RUNNING" } },
    });
    trino.pages.set("next-1", {
      id: "trino-1",
      columns: [
        { name: "id", type: "integer" },
        { name: "label", type: "varchar" },
      ],
      data: [
        [1, "one"],
        [2, "two"],
        [3, "three"],
      ],
      stats: { state: "FINISHED", processedBytes: 42 },
    });

    const harness = createFacadeHarness({ trino });
    const client = createSdkClient(harness.service);

    const started = await client.send(
      new StartQueryExecutionCommand({
        QueryString: "select id, label from example",
        QueryExecutionContext: { Catalog: "AwsDataCatalog", Database: "default" },
        ResultConfiguration: {
          OutputLocation: "s3://athena-local-results/local/",
        },
      }),
    );
    const queryExecutionId = started.QueryExecutionId;
    expect(queryExecutionId).toBeDefined();

    // Poll exactly as an application would.
    let state: string | undefined;
    for (let attempt = 0; attempt < 10; attempt++) {
      const current = await client.send(
        new GetQueryExecutionCommand({ QueryExecutionId: queryExecutionId }),
      );
      state = current.QueryExecution?.Status?.State;
      if (state === "SUCCEEDED" || state === "FAILED" || state === "CANCELLED") {
        expect(current.QueryExecution?.ResultConfiguration?.OutputLocation).toContain(
          ".csv",
        );
        expect(
          current.QueryExecution?.Statistics?.DataScannedInBytes,
        ).toBe(42);
        break;
      }
    }
    expect(state).toBe("SUCCEEDED");

    // First page: header row + first two data rows.
    const firstPage = await client.send(
      new GetQueryResultsCommand({
        QueryExecutionId: queryExecutionId,
        MaxResults: 3,
      }),
    );
    expect(firstPage.ResultSet?.Rows?.[0]?.Data).toEqual([
      { VarCharValue: "id" },
      { VarCharValue: "label" },
    ]);
    expect(firstPage.ResultSet?.Rows).toHaveLength(3);
    expect(firstPage.NextToken).toBeDefined();

    // Second page: the remaining row, no further token.
    const secondPage = await client.send(
      new GetQueryResultsCommand({
        QueryExecutionId: queryExecutionId,
        MaxResults: 3,
        NextToken: firstPage.NextToken,
      }),
    );
    expect(secondPage.ResultSet?.Rows?.[0]?.Data).toEqual([
      { VarCharValue: "3" },
      { VarCharValue: "three" },
    ]);
    expect(secondPage.NextToken).toBeUndefined();

    // The CSV result object was materialized to storage.
    expect(harness.storage.writes).toHaveLength(1);
    expect(harness.storage.writes[0]?.contentType).toContain("csv");

    harness.close();
  });

  test("surfaces Trino failures as a FAILED execution", async () => {
    const trino = new FakeTrino({
      queryId: "trino-1",
      page: {
        id: "trino-1",
        stats: { state: "FAILED" },
        error: {
          message: "line 1:8: Table 'hive.default.missing' does not exist",
          errorName: "TABLE_NOT_FOUND",
          errorType: "USER_ERROR",
        },
      },
    });
    const harness = createFacadeHarness({ trino });
    const client = createSdkClient(harness.service);

    const started = await client.send(
      new StartQueryExecutionCommand({ QueryString: "select * from missing" }),
    );

    const current = await client.send(
      new GetQueryExecutionCommand({
        QueryExecutionId: started.QueryExecutionId,
      }),
    );
    expect(current.QueryExecution?.Status?.State).toBe("FAILED");
    expect(current.QueryExecution?.Status?.StateChangeReason).toContain(
      "does not exist",
    );

    // Results are not available for a failed query.
    await expect(
      client.send(
        new GetQueryResultsCommand({
          QueryExecutionId: started.QueryExecutionId,
        }),
      ),
    ).rejects.toThrow();

    harness.close();
  });

  test("honors ClientRequestToken idempotency across SDK calls", async () => {
    const trino = new FakeTrino({
      queryId: "trino-1",
      page: {
        id: "trino-1",
        columns: [{ name: "n", type: "integer" }],
        data: [[1]],
        stats: { state: "FINISHED" },
      },
    });
    const harness = createFacadeHarness({ trino });
    const client = createSdkClient(harness.service);

    const first = await client.send(
      new StartQueryExecutionCommand({
        QueryString: "select 1",
        ClientRequestToken: "idempotent-token",
      }),
    );
    const second = await client.send(
      new StartQueryExecutionCommand({
        QueryString: "select 1",
        ClientRequestToken: "idempotent-token",
      }),
    );

    expect(second.QueryExecutionId).toBe(first.QueryExecutionId);
    expect(trino.submissions).toHaveLength(1);

    harness.close();
  });
});
