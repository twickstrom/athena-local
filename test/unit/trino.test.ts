import { describe, expect, test } from "bun:test";
import { TrinoClient, type TrinoFetch } from "../../src/trino/client.ts";
import {
  mapTrinoError,
  mapTrinoStatsToQueryState,
} from "../../src/trino/error-mapping.ts";
import { parseTrinoPage } from "../../src/trino/parse.ts";

describe("Trino response parsing", () => {
  test("parses a valid page", () => {
    expect(
      parseTrinoPage({
        id: "query-1",
        nextUri: "http://trino/next",
        columns: [{ name: "x", type: "integer" }],
        data: [[1]],
        stats: {
          state: "RUNNING",
          processedBytes: 12,
        },
      }),
    ).toEqual({
      id: "query-1",
      nextUri: "http://trino/next",
      columns: [{ name: "x", type: "integer" }],
      data: [[1]],
      stats: {
        state: "RUNNING",
        processedBytes: 12,
      },
    });
  });

  test("rejects malformed pages", () => {
    expect(() => parseTrinoPage({ id: "query-1" })).toThrow(
      "stats must be an object.",
    );
  });
});

describe("Trino client", () => {
  test("submits SQL to /v1/statement with Trino headers", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fakeFetch: TrinoFetch = async (url, init) => {
      calls.push({ url: String(url), init });
      return Response.json({
        id: "query-1",
        nextUri: "http://trino/next",
        stats: {
          state: "RUNNING",
        },
      });
    };

    const client = new TrinoClient(
      {
        endpoint: "http://trino",
        user: "athena-local",
        catalog: "hive",
        schema: "default",
      },
      fakeFetch,
    );

    const submitted = await client.submit("select 1");

    expect(submitted.queryId).toBe("query-1");
    expect(submitted.nextUri).toBe("http://trino/next");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://trino/v1/statement");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.init?.body).toBe("select 1");
    expect(calls[0]?.init?.headers).toEqual({
      "content-type": "text/plain",
      "x-trino-user": "athena-local",
      "x-trino-catalog": "hive",
      "x-trino-schema": "default",
    });
  });

  test("fetches nextUri pages", async () => {
    const fakeFetch: TrinoFetch = async (url, init) => {
      expect(String(url)).toBe("http://trino/next");
      expect(init?.method).toBe("GET");
      return Response.json({
        id: "query-1",
        stats: {
          state: "FINISHED",
        },
      });
    };

    const client = new TrinoClient(
      {
        endpoint: "http://trino",
        user: "athena-local",
        catalog: "hive",
      },
      fakeFetch,
    );

    expect(await client.fetchNext("http://trino/next")).toEqual({
      id: "query-1",
      stats: {
        state: "FINISHED",
      },
    });
  });

  test("cancels through DELETE nextUri", async () => {
    const fakeFetch: TrinoFetch = async (url, init) => {
      expect(String(url)).toBe("http://trino/next");
      expect(init?.method).toBe("DELETE");
      return new Response(null, { status: 204 });
    };

    const client = new TrinoClient(
      {
        endpoint: "http://trino",
        user: "athena-local",
        catalog: "hive",
      },
      fakeFetch,
    );

    await expect(client.cancel("http://trino/next")).resolves.toBeUndefined();
  });

  test("raises HTTP failures with response text", async () => {
    const fakeFetch: TrinoFetch = async () =>
      new Response("unavailable", { status: 503 });

    const client = new TrinoClient(
      {
        endpoint: "http://trino",
        user: "athena-local",
        catalog: "hive",
      },
      fakeFetch,
    );

    await expect(client.submit("select 1")).rejects.toThrow(
      "Trino request failed with HTTP 503: unavailable",
    );
  });
});

describe("Trino state and error mapping", () => {
  test("maps Trino stats to query states", () => {
    expect(mapTrinoStatsToQueryState({ state: "QUEUED" })).toBe("QUEUED");
    expect(mapTrinoStatsToQueryState({ state: "RUNNING" })).toBe("RUNNING");
    expect(mapTrinoStatsToQueryState({ state: "FINISHED" })).toBe("SUCCEEDED");
    expect(mapTrinoStatsToQueryState({ state: "FAILED" })).toBe("FAILED");
  });

  test("maps Trino errors to failed query metadata", () => {
    expect(
      mapTrinoError({
        message: "Table not found",
        errorName: "TABLE_NOT_FOUND",
        errorType: "USER_ERROR",
      }),
    ).toEqual({
      state: "FAILED",
      stateReason: "Table not found",
      retryable: false,
      errorJson: JSON.stringify({
        message: "Table not found",
        errorName: "TABLE_NOT_FOUND",
        errorType: "USER_ERROR",
        errorCode: undefined,
      }),
    });
  });
});
