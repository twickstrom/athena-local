import { describe, expect, test } from "bun:test";
import {
  AthenaClient,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  StartQueryExecutionCommand,
} from "@aws-sdk/client-athena";

/**
 * Live full-stack end-to-end test. Unlike test/e2e/sdk-lifecycle.test.ts (which
 * fakes Trino and storage), this drives a real AthenaClient against a running
 * Athena Local stack — facade + Trino + Hive Metastore + MinIO — and expects the
 * seeded `athena_local_smoke` table to be queryable with results materialized to
 * object storage.
 *
 * It is opt-in: it runs only when ATHENA_LOCAL_LIVE=1, so the default suite and
 * CI checks job stay infrastructure-free. The Docker integration workflow starts
 * the stack, seeds it, and runs this with ATHENA_LOCAL_LIVE=1.
 */
const enabled = process.env.ATHENA_LOCAL_LIVE === "1";
const endpoint = process.env.ATHENA_ENDPOINT ?? "http://127.0.0.1:4567";

describe("live stack end-to-end", () => {
  test.skipIf(!enabled)(
    "queries the seeded table through a real AthenaClient",
    async () => {
      const athena = new AthenaClient({
        region: "us-east-1",
        endpoint,
        credentials: { accessKeyId: "local", secretAccessKey: "local-secret" },
      });

      const started = await athena.send(
        new StartQueryExecutionCommand({
          QueryString: "select id, label from athena_local_smoke order by id",
          QueryExecutionContext: {
            Catalog: "AwsDataCatalog",
            Database: "default",
          },
          ResultConfiguration: {
            OutputLocation: "s3://athena-local-results/local/",
          },
        }),
      );
      const id = started.QueryExecutionId;
      expect(id).toBeDefined();

      let state: string | undefined;
      let outputLocation: string | undefined;
      for (let attempt = 0; attempt < 120; attempt++) {
        const current = await athena.send(
          new GetQueryExecutionCommand({ QueryExecutionId: id }),
        );
        state = current.QueryExecution?.Status?.State;
        outputLocation = current.QueryExecution?.ResultConfiguration?.OutputLocation;
        if (state === "SUCCEEDED" || state === "FAILED" || state === "CANCELLED") {
          if (state !== "SUCCEEDED") {
            throw new Error(
              `Query ${state}: ${current.QueryExecution?.Status?.StateChangeReason}`,
            );
          }
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      expect(state).toBe("SUCCEEDED");
      expect(outputLocation).toContain("s3://athena-local-results/");
      expect(outputLocation).toContain(".csv");

      const results = await athena.send(
        new GetQueryResultsCommand({ QueryExecutionId: id, MaxResults: 10 }),
      );
      const rows = (results.ResultSet?.Rows ?? []).map((row) =>
        (row.Data ?? []).map((cell) => cell.VarCharValue ?? ""),
      );

      expect(rows[0]).toEqual(["id", "label"]);
      expect(rows.slice(1)).toEqual([
        ["1", "one"],
        ["2", "two"],
        ["3", "three"],
      ]);
    },
    60_000,
  );

  test.skipIf(enabled)("is skipped unless ATHENA_LOCAL_LIVE=1", () => {
    expect(enabled).toBe(false);
  });
});
