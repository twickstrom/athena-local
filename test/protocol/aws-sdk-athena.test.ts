import { describe, expect, test } from "bun:test";
import {
  AthenaClient,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  StartQueryExecutionCommand,
  StopQueryExecutionCommand,
} from "@aws-sdk/client-athena";
import { HttpResponse } from "@smithy/core/protocols";
import type { HttpRequest } from "@smithy/core/protocols";
import type { HttpHandlerOptions } from "@smithy/types";
import type { AthenaOperationHandlers } from "../../src/protocol/athena-types.ts";
import { createAthenaHttpHandler } from "../../src/server/http.ts";

function createClient(handlers: AthenaOperationHandlers): AthenaClient {
  const handler = createAthenaHttpHandler({ handlers });

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
