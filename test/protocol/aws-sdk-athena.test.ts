// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import { describe, expect, test } from "bun:test";
import {
  AthenaClient,
  BatchGetQueryExecutionCommand,
  GetDatabaseCommand,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  GetTableMetadataCommand,
  GetWorkGroupCommand,
  ListDatabasesCommand,
  ListQueryExecutionsCommand,
  ListTableMetadataCommand,
  ListWorkGroupsCommand,
  StartQueryExecutionCommand,
  StopQueryExecutionCommand,
} from "@aws-sdk/client-athena";
import { HttpResponse } from "@smithy/core/protocols";
import type { HttpRequest } from "@smithy/core/protocols";
import type { HttpHandlerOptions } from "@smithy/types";
import type { AthenaOperationHandlers } from "../../src/protocol/athena-types.ts";
import { createAthenaHttpHandler } from "../../src/server/http.ts";
import { createHandlers } from "../support/handlers.ts";

function createClient(
  overrides: Partial<AthenaOperationHandlers>,
): AthenaClient {
  const handler = createAthenaHttpHandler({
    handlers: createHandlers(overrides),
  });

  return new AthenaClient({
    endpoint: "http://127.0.0.1:4567",
    region: "us-east-1",
    credentials: {
      accessKeyId: "local",
      secretAccessKey: "local-secret",
    },
    requestHandler: {
      handle: async (request: HttpRequest, _options?: HttpHandlerOptions) => {
        const response = await handler(
          new Request(`${request.protocol}//${request.hostname}${request.path}`, {
            method: request.method,
            headers: request.headers,
            body: request.body,
          }),
        );

        return {
          response: new HttpResponse({
            statusCode: response.status,
            headers: Object.fromEntries(response.headers.entries()),
            body: await response.bytes(),
          }),
        };
      },
      updateHttpClientConfig: () => {},
      httpHandlerConfigs: () => ({}),
    },
  });
}

describe("AWS SDK Athena protocol compatibility", () => {
  test("accepts StartQueryExecution from the real AthenaClient", async () => {
    const client = createClient({
      StartQueryExecution: (input) => {
        expect(input.QueryString).toBe("select 1");
        expect(input.QueryExecutionContext).toEqual({
          Catalog: "AwsDataCatalog",
          Database: "default",
        });
        expect(input.ResultConfiguration).toEqual({
          OutputLocation: "s3://athena-local-results/local/",
        });
        return {
          QueryExecutionId: "query-1",
        };
      },
      GetQueryExecution: () => {
        throw new Error("unexpected");
      },
      GetQueryResults: () => {
        throw new Error("unexpected");
      },
      StopQueryExecution: () => {
        throw new Error("unexpected");
      },
    });

    const output = await client.send(
      new StartQueryExecutionCommand({
        QueryString: "select 1",
        QueryExecutionContext: {
          Catalog: "AwsDataCatalog",
          Database: "default",
        },
        ResultConfiguration: {
          OutputLocation: "s3://athena-local-results/local/",
        },
      }),
    );

    expect(output.QueryExecutionId).toBe("query-1");
  });

  test("deserializes GetQueryExecution and GetQueryResults responses", async () => {
    const client = createClient({
      StartQueryExecution: () => ({ QueryExecutionId: "query-1" }),
      GetQueryExecution: (input) => ({
        QueryExecution: {
          QueryExecutionId: input.QueryExecutionId,
          Query: "select 1",
          Status: {
            State: "SUCCEEDED",
          },
          ResultConfiguration: {
            OutputLocation: "s3://athena-local-results/local/query-1.csv",
          },
          QueryExecutionContext: {
            Catalog: "AwsDataCatalog",
            Database: "default",
          },
          Statistics: {
            EngineExecutionTimeInMillis: 1,
            DataScannedInBytes: 0,
          },
        },
      }),
      GetQueryResults: () => ({
        ResultSet: {
          ResultSetMetadata: {
            ColumnInfo: [
              {
                Name: "value",
                Type: "integer",
                Nullable: "UNKNOWN",
                CaseSensitive: true,
              },
            ],
          },
          Rows: [
            {
              Data: [{ VarCharValue: "value" }],
            },
            {
              Data: [{ VarCharValue: "1" }],
            },
          ],
        },
      }),
      StopQueryExecution: () => ({}),
    });

    const execution = await client.send(
      new GetQueryExecutionCommand({
        QueryExecutionId: "query-1",
      }),
    );

    expect(execution.QueryExecution?.Status?.State).toBe("SUCCEEDED");
    expect(execution.QueryExecution?.ResultConfiguration?.OutputLocation).toBe(
      "s3://athena-local-results/local/query-1.csv",
    );

    const results = await client.send(
      new GetQueryResultsCommand({
        QueryExecutionId: "query-1",
      }),
    );

    expect(results.ResultSet?.Rows?.[1]?.Data?.[0]?.VarCharValue).toBe("1");
  });

  test("accepts StopQueryExecution from the real AthenaClient", async () => {
    const stopped: string[] = [];
    const client = createClient({
      StartQueryExecution: () => ({ QueryExecutionId: "query-1" }),
      GetQueryExecution: () => {
        throw new Error("unexpected");
      },
      GetQueryResults: () => {
        throw new Error("unexpected");
      },
      StopQueryExecution: (input) => {
        stopped.push(input.QueryExecutionId);
        return {};
      },
    });

    await client.send(
      new StopQueryExecutionCommand({
        QueryExecutionId: "query-1",
      }),
    );

    expect(stopped).toEqual(["query-1"]);
  });
});

describe("AWS SDK catalog and workgroup compatibility", () => {
  test("round-trips GetWorkGroup", async () => {
    const client = createClient({
      GetWorkGroup: (input) => {
        expect(input.WorkGroup).toBe("primary");
        return {
          WorkGroup: {
            Name: "primary",
            State: "ENABLED",
            Configuration: {
              ResultConfiguration: {
                OutputLocation: "s3://athena-local-results/local/",
              },
            },
          },
        };
      },
    });

    const output = await client.send(
      new GetWorkGroupCommand({ WorkGroup: "primary" }),
    );
    expect(output.WorkGroup?.Configuration?.ResultConfiguration?.OutputLocation).toBe(
      "s3://athena-local-results/local/",
    );
  });

  test("round-trips ListWorkGroups", async () => {
    const client = createClient({
      ListWorkGroups: () => ({
        WorkGroups: [{ Name: "primary", State: "ENABLED" }],
      }),
    });
    const output = await client.send(new ListWorkGroupsCommand({}));
    expect(output.WorkGroups?.[0]?.Name).toBe("primary");
  });

  test("round-trips BatchGetQueryExecution", async () => {
    const client = createClient({
      BatchGetQueryExecution: (input) => {
        expect(input.QueryExecutionIds).toEqual(["q-1", "missing"]);
        return {
          QueryExecutions: [
            { QueryExecutionId: "q-1", Status: { State: "SUCCEEDED" } },
          ],
          UnprocessedQueryExecutionIds: [
            { QueryExecutionId: "missing", ErrorCode: "INVALID_INPUT" },
          ],
        };
      },
    });

    const output = await client.send(
      new BatchGetQueryExecutionCommand({
        QueryExecutionIds: ["q-1", "missing"],
      }),
    );
    expect(output.QueryExecutions?.[0]?.QueryExecutionId).toBe("q-1");
    expect(output.UnprocessedQueryExecutionIds?.[0]?.ErrorCode).toBe(
      "INVALID_INPUT",
    );
  });

  test("round-trips ListQueryExecutions with a NextToken", async () => {
    const client = createClient({
      ListQueryExecutions: () => ({
        QueryExecutionIds: ["q-2", "q-1"],
        NextToken: "next",
      }),
    });
    const output = await client.send(new ListQueryExecutionsCommand({}));
    expect(output.QueryExecutionIds).toEqual(["q-2", "q-1"]);
    expect(output.NextToken).toBe("next");
  });

  test("round-trips GetDatabase and ListDatabases", async () => {
    const client = createClient({
      GetDatabase: (input) => {
        expect(input.DatabaseName).toBe("sales");
        return { Database: { Name: "sales" } };
      },
      ListDatabases: () => ({
        DatabaseList: [{ Name: "default" }, { Name: "sales" }],
      }),
    });

    const database = await client.send(
      new GetDatabaseCommand({ CatalogName: "AwsDataCatalog", DatabaseName: "sales" }),
    );
    expect(database.Database?.Name).toBe("sales");

    const list = await client.send(
      new ListDatabasesCommand({ CatalogName: "AwsDataCatalog" }),
    );
    expect(list.DatabaseList?.map((database) => database.Name)).toEqual([
      "default",
      "sales",
    ]);
  });

  test("round-trips GetTableMetadata and ListTableMetadata", async () => {
    const client = createClient({
      GetTableMetadata: (input) => {
        expect(input.TableName).toBe("events");
        return {
          TableMetadata: {
            Name: "events",
            Columns: [{ Name: "id", Type: "integer" }],
          },
        };
      },
      ListTableMetadata: () => ({
        TableMetadataList: [{ Name: "events" }, { Name: "orders" }],
        NextToken: "more",
      }),
    });

    const table = await client.send(
      new GetTableMetadataCommand({
        CatalogName: "AwsDataCatalog",
        DatabaseName: "default",
        TableName: "events",
      }),
    );
    expect(table.TableMetadata?.Columns?.[0]?.Name).toBe("id");

    const list = await client.send(
      new ListTableMetadataCommand({
        CatalogName: "AwsDataCatalog",
        DatabaseName: "default",
      }),
    );
    expect(list.TableMetadataList?.map((table) => table.Name)).toEqual([
      "events",
      "orders",
    ]);
    expect(list.NextToken).toBe("more");
  });
});
