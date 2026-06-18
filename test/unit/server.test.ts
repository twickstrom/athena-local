import { describe, expect, test } from "bun:test";
import { createAthenaHttpHandler } from "../../src/server/http.ts";
import { createHandlers } from "../support/handlers.ts";

const handlers = createHandlers({
  StartQueryExecution: () => ({ QueryExecutionId: "query-1" }),
  GetQueryExecution: () => ({
    QueryExecution: {
      QueryExecutionId: "query-1",
      Status: { State: "SUCCEEDED" },
    },
  }),
  GetQueryResults: () => ({
    ResultSet: {
      Rows: [],
    },
  }),
  StopQueryExecution: () => ({}),
});

describe("Athena HTTP handler", () => {
  test("returns health response", async () => {
    const handler = createAthenaHttpHandler({ handlers });
    const response = await handler(new Request("http://localhost/health"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      service: "athena-local",
    });
  });

  test("routes AWS JSON requests", async () => {
    const handler = createAthenaHttpHandler({ handlers });
    const response = await handler(
      new Request("http://localhost/", {
        method: "POST",
        headers: {
          "content-type": "application/x-amz-json-1.1",
          "x-amz-target": "AmazonAthena.StartQueryExecution",
        },
        body: JSON.stringify({
          QueryString: "select 1",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/x-amz-json-1.1");
    expect(await response.json()).toEqual({
      QueryExecutionId: "query-1",
    });
  });

  test("returns AWS JSON error for malformed JSON", async () => {
    const handler = createAthenaHttpHandler({ handlers });
    const response = await handler(
      new Request("http://localhost/", {
        method: "POST",
        headers: {
          "x-amz-target": "AmazonAthena.StartQueryExecution",
        },
        body: "{nope",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      __type: "InvalidRequestException",
      message: "Request body must be valid JSON.",
    });
  });
});
