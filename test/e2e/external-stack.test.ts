// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import { describe, expect, test } from "bun:test";
import {
  AthenaClient,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  StartQueryExecutionCommand,
} from "@aws-sdk/client-athena";
import { SigV4BucketManager } from "../../src/storage/buckets.ts";

/**
 * Live attach-mode regression test. Boots are external: athena-local supplies
 * Trino + Hive Metastore + catalog and attaches to an external object store this
 * test seeds with NDJSON. It pins that an EXTERNAL table registered at an
 * `s3://` location — the scheme real Athena uses — round-trips, AND that `s3a://`
 * keeps working, so a Hive/Hadoop image bump can't silently regress either.
 *
 * Opt-in: runs only when ATHENA_LOCAL_LIVE_EXTERNAL=1, with the external stack
 * already up and these set: ATHENA_LOCAL_S3_ENDPOINT (host view), _S3_BUCKET,
 * _S3_ACCESS_KEY, _S3_SECRET_KEY. The Integration workflow wires this.
 */
const enabled = process.env.ATHENA_LOCAL_LIVE_EXTERNAL === "1";
const facadeEndpoint = process.env.ATHENA_ENDPOINT ?? "http://127.0.0.1:4567";
const storeEndpoint = process.env.ATHENA_LOCAL_S3_ENDPOINT ?? "http://127.0.0.1:9000";
const bucket = process.env.ATHENA_LOCAL_S3_BUCKET ?? "analytics";
const accessKeyId = process.env.ATHENA_LOCAL_S3_ACCESS_KEY ?? "minioadmin";
const secretAccessKey = process.env.ATHENA_LOCAL_S3_SECRET_KEY ?? "minioadmin";

const athena = new AthenaClient({
  region: "us-east-1",
  endpoint: facadeEndpoint,
  credentials: { accessKeyId: "local", secretAccessKey: "local-secret" },
});

async function runToSuccess(sql: string, database?: string): Promise<string> {
  const { QueryExecutionId } = await athena.send(
    new StartQueryExecutionCommand({
      QueryString: sql,
      ...(database === undefined
        ? {}
        : {
            QueryExecutionContext: {
              Catalog: "AwsDataCatalog",
              Database: database,
            },
          }),
    }),
  );
  const id = QueryExecutionId!;
  for (let attempt = 0; attempt < 200; attempt++) {
    const { QueryExecution } = await athena.send(
      new GetQueryExecutionCommand({ QueryExecutionId: id }),
    );
    const state = QueryExecution?.Status?.State;
    if (state === "SUCCEEDED") return id;
    if (state === "FAILED" || state === "CANCELLED") {
      throw new Error(`${state}: ${QueryExecution?.Status?.StateChangeReason}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Query did not finish: ${sql}`);
}

async function seedFixture(): Promise<void> {
  await new SigV4BucketManager({
    endpoint: storeEndpoint,
    region: "us-east-1",
    accessKeyId,
    secretAccessKey,
  }).ensureBucket(bucket);
  const s3 = new Bun.S3Client({
    endpoint: storeEndpoint,
    region: "us-east-1",
    accessKeyId,
    secretAccessKey,
    bucket,
  });
  const ndjson = [
    JSON.stringify({ id: 1, label: "one" }),
    JSON.stringify({ id: 2, label: null }),
  ].join("\n");
  await s3.write("events/account_id=acct-1/dt=2026-06-18/b1.json", ndjson, {
    type: "application/x-ndjson",
  });
}

describe("attach mode: external tables over s3:// and s3a://", () => {
  test.skipIf(!enabled)(
    "registers and queries an s3:// external table (and s3a:// stays green)",
    async () => {
      await seedFixture();

      await runToSuccess(
        `CREATE SCHEMA IF NOT EXISTS analytics WITH (location = 's3://${bucket}/warehouse/')`,
      );

      for (const [name, scheme] of [
        ["events_s3", "s3"],
        ["events_s3a", "s3a"],
      ] as const) {
        await runToSuccess(
          `CREATE TABLE IF NOT EXISTS analytics.${name} (id bigint, label varchar, account_id varchar, dt varchar) ` +
            `WITH (format = 'JSON', external_location = '${scheme}://${bucket}/events/', partitioned_by = ARRAY['account_id','dt'])`,
        );
        await runToSuccess(
          `CALL system.sync_partition_metadata('analytics', '${name}', 'FULL')`,
        );

        // Bare table name, database set per request — the standard Athena pattern.
        const id = await runToSuccess(
          `SELECT id, label FROM ${name} WHERE account_id='acct-1' AND dt='2026-06-18' ORDER BY id`,
          "analytics",
        );
        const { ResultSet } = await athena.send(
          new GetQueryResultsCommand({ QueryExecutionId: id, MaxResults: 10 }),
        );
        const rows = (ResultSet?.Rows ?? []).map((row) =>
          (row.Data ?? []).map((cell) => cell.VarCharValue ?? null),
        );
        expect(rows[0]).toEqual(["id", "label"]);
        expect(rows[1]).toEqual(["1", "one"]);
        // NULL label → empty Datum → VarCharValue absent → mapped to null here.
        expect(rows[2]).toEqual(["2", null]);
      }
    },
    120_000,
  );

  test.skipIf(enabled)("is skipped unless ATHENA_LOCAL_LIVE_EXTERNAL=1", () => {
    expect(enabled).toBe(false);
  });
});
