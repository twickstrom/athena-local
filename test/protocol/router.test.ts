// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import { describe, expect, test } from "bun:test";
import { routeAthenaRequest } from "../../src/protocol/router.ts";
import { createHandlers } from "../support/handlers.ts";

const handlers = createHandlers({
  StartQueryExecution: (input) => ({
    QueryExecutionId: `started:${input.QueryString}`,
  }),
  GetQueryExecution: (input) => ({
    QueryExecution: {
      QueryExecutionId: input.QueryExecutionId,
      Status: {
        State: "SUCCEEDED",
      },
    },
  }),
  GetQueryResults: (input) => ({
    ResultSet: {
      QueryExecutionId: input.QueryExecutionId,
    },
    ...(input.NextToken === undefined ? {} : { NextToken: input.NextToken }),
  }),
  StopQueryExecution: () => ({}),
});

describe("AWS JSON Athena protocol routing", () => {
  test("routes StartQueryExecution by X-Amz-Target", async () => {
    const response = await routeAthenaRequest(
      {
        method: "POST",
        headers: {
          "X-Amz-Target": "AmazonAthena.StartQueryExecution",
        },
        body: {
          QueryString: "select 1",
        },
      },
      handlers,
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      QueryExecutionId: "started:select 1",
    });
  });

  test("returns AWS-style error envelope for unsupported operations", async () => {
    const response = await routeAthenaRequest(
      {
        method: "POST",
        headers: {
          "X-Amz-Target": "AmazonAthena.CreateNotebook",
        },
        body: {},
      },
      handlers,
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      __type: "InvalidRequestException",
      message: "Unsupported Athena operation: AmazonAthena.CreateNotebook",
    });
  });

  test("validates required fields", async () => {
    const response = await routeAthenaRequest(
      {
        method: "POST",
        headers: {
          "X-Amz-Target": "AmazonAthena.GetQueryExecution",
        },
        body: {},
      },
      handlers,
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      __type: "InvalidRequestException",
      message: "QueryExecutionId must be a non-empty string.",
    });
  });

  test("validates MaxResults", async () => {
    const response = await routeAthenaRequest(
      {
        method: "POST",
        headers: {
          "X-Amz-Target": "AmazonAthena.GetQueryResults",
        },
        body: {
          QueryExecutionId: "query-1",
          MaxResults: 0,
        },
      },
      handlers,
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      __type: "InvalidRequestException",
      message: "MaxResults must be a positive integer.",
    });
  });

  test("rejects non-POST requests", async () => {
    const response = await routeAthenaRequest(
      {
        method: "GET",
        headers: {},
        body: {},
      },
      handlers,
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      __type: "InvalidRequestException",
      message: "Not found.",
    });
  });
});
