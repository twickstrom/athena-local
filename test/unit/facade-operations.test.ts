// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import { describe, expect, test } from "bun:test";
import type { TrinoColumn } from "../../src/trino/types.ts";
import {
  createFacadeHarness,
  FakeTrino,
  MetadataTrino,
} from "../support/fakes.ts";

const idleTrino = () =>
  new FakeTrino({
    queryId: "unused",
    page: { id: "unused", stats: { state: "FINISHED" } },
  });

function seedRecords(
  repository: ReturnType<typeof createFacadeHarness>["repository"],
  records: ReadonlyArray<{
    id: string;
    submittedAt: number;
    workgroup?: string;
  }>,
): void {
  for (const record of records) {
    repository.createOrGetByToken({
      queryExecutionId: record.id,
      queryText: `select ${record.id}`,
      submittedAt: record.submittedAt,
      ...(record.workgroup === undefined ? {} : { workgroup: record.workgroup }),
    });
  }
}

describe("GetWorkGroup / ListWorkGroups", () => {
  test("reports the configured output location for the requested workgroup", () => {
    const harness = createFacadeHarness({ trino: idleTrino() });
    const output = harness.service.GetWorkGroup({ WorkGroup: "analytics" });
    const workgroup = output.WorkGroup as {
      Name: string;
      State: string;
      Configuration: { ResultConfiguration: { OutputLocation: string } };
    };

    expect(workgroup.Name).toBe("analytics");
    expect(workgroup.State).toBe("ENABLED");
    expect(workgroup.Configuration.ResultConfiguration.OutputLocation).toBe(
      "s3://athena-local-results/local/",
    );
    harness.close();
  });

  test("lists the default workgroup", () => {
    const harness = createFacadeHarness({ trino: idleTrino() });
    const output = harness.service.ListWorkGroups({});
    const groups = output.WorkGroups as ReadonlyArray<{ Name: string }>;

    expect(groups).toHaveLength(1);
    expect(groups[0]?.Name).toBe("primary");
    expect(output.NextToken).toBeUndefined();
    harness.close();
  });
});

describe("BatchGetQueryExecution", () => {
  test("returns found executions and reports unknown IDs as unprocessed", () => {
    const harness = createFacadeHarness({ trino: idleTrino() });
    seedRecords(harness.repository, [
      { id: "query-1", submittedAt: 10 },
      { id: "query-2", submittedAt: 20 },
    ]);

    const output = harness.service.BatchGetQueryExecution({
      QueryExecutionIds: ["query-1", "missing", "query-2"],
    });
    const executions = output.QueryExecutions as ReadonlyArray<{
      QueryExecutionId: string;
    }>;
    const unprocessed = output.UnprocessedQueryExecutionIds as ReadonlyArray<{
      QueryExecutionId: string;
      ErrorCode: string;
      ErrorMessage: string;
    }>;

    expect(executions.map((execution) => execution.QueryExecutionId)).toEqual([
      "query-1",
      "query-2",
    ]);
    expect(unprocessed).toEqual([
      {
        QueryExecutionId: "missing",
        ErrorCode: "INVALID_INPUT",
        ErrorMessage: "Unknown query execution ID: missing",
      },
    ]);
    harness.close();
  });
});

describe("ListQueryExecutions", () => {
  test("returns IDs most-recent-first and paginates with an opaque token", () => {
    const harness = createFacadeHarness({ trino: idleTrino() });
    seedRecords(harness.repository, [
      { id: "older", submittedAt: 10 },
      { id: "middle", submittedAt: 20 },
      { id: "newest", submittedAt: 30 },
    ]);

    const first = harness.service.ListQueryExecutions({ MaxResults: 2 });
    expect(first.QueryExecutionIds).toEqual(["newest", "middle"]);
    expect(first.NextToken).toBeDefined();

    const second = harness.service.ListQueryExecutions({
      MaxResults: 2,
      NextToken: first.NextToken!,
    });
    expect(second.QueryExecutionIds).toEqual(["older"]);
    expect(second.NextToken).toBeUndefined();
    harness.close();
  });

  test("filters by workgroup when requested", () => {
    const harness = createFacadeHarness({ trino: idleTrino() });
    seedRecords(harness.repository, [
      { id: "a", submittedAt: 10, workgroup: "primary" },
      { id: "b", submittedAt: 20, workgroup: "reporting" },
      { id: "c", submittedAt: 30, workgroup: "reporting" },
    ]);

    const output = harness.service.ListQueryExecutions({ WorkGroup: "reporting" });
    expect(output.QueryExecutionIds).toEqual(["c", "b"]);
    harness.close();
  });

  test("rejects a NextToken minted for a different list operation", () => {
    const harness = createFacadeHarness({ trino: idleTrino() });
    const workgroupsToken = btoa(
      JSON.stringify({ scope: "ListWorkGroups", offset: 0 }),
    );
    expect(() =>
      harness.service.ListQueryExecutions({ NextToken: workgroupsToken }),
    ).toThrow("Invalid NextToken.");
    harness.close();
  });
});

describe("catalog metadata operations", () => {
  const schemaColumns: readonly TrinoColumn[] = [
    { name: "schema_name", type: "varchar" },
  ];
  const columnColumns: readonly TrinoColumn[] = [
    { name: "table_name", type: "varchar" },
    { name: "column_name", type: "varchar" },
    { name: "data_type", type: "varchar" },
  ];

  test("GetDatabase returns the database when it exists", async () => {
    const trino = new MetadataTrino((sql) => {
      expect(sql).toContain("schema_name = 'sales'");
      return { columns: schemaColumns, data: [["sales"]] };
    });
    const harness = createFacadeHarness({ trino });
    const output = await harness.service.GetDatabase({
      CatalogName: "AwsDataCatalog",
      DatabaseName: "sales",
    });
    expect(output.Database).toEqual({ Name: "sales" });
    harness.close();
  });

  test("GetDatabase throws MetadataException when missing", async () => {
    const trino = new MetadataTrino(() => ({
      columns: schemaColumns,
      data: [],
    }));
    const harness = createFacadeHarness({ trino });
    await expect(
      harness.service.GetDatabase({
        CatalogName: "AwsDataCatalog",
        DatabaseName: "ghost",
      }),
    ).rejects.toThrow("Database ghost not found");
    harness.close();
  });

  test("ListDatabases excludes information_schema", async () => {
    const trino = new MetadataTrino(() => ({
      columns: schemaColumns,
      data: [["default"], ["information_schema"], ["sales"]],
    }));
    const harness = createFacadeHarness({ trino });
    const output = await harness.service.ListDatabases({
      CatalogName: "AwsDataCatalog",
    });
    expect(output.DatabaseList).toEqual([{ Name: "default" }, { Name: "sales" }]);
    harness.close();
  });

  test("GetTableMetadata returns columns for the table", async () => {
    const trino = new MetadataTrino((sql) => {
      expect(sql).toContain("table_schema = 'default'");
      expect(sql).toContain("table_name = 'events'");
      return {
        columns: [
          { name: "column_name", type: "varchar" },
          { name: "data_type", type: "varchar" },
        ],
        data: [
          ["id", "integer"],
          ["label", "varchar"],
        ],
      };
    });
    const harness = createFacadeHarness({ trino });
    const output = await harness.service.GetTableMetadata({
      CatalogName: "AwsDataCatalog",
      DatabaseName: "default",
      TableName: "events",
    });
    const table = output.TableMetadata as {
      Name: string;
      Columns: ReadonlyArray<{ Name: string; Type: string }>;
    };
    expect(table.Name).toBe("events");
    expect(table.Columns).toEqual([
      { Name: "id", Type: "integer" },
      { Name: "label", Type: "varchar" },
    ]);
    harness.close();
  });

  test("GetTableMetadata throws when the table has no columns", async () => {
    const trino = new MetadataTrino(() => ({ columns: [], data: [] }));
    const harness = createFacadeHarness({ trino });
    await expect(
      harness.service.GetTableMetadata({
        CatalogName: "AwsDataCatalog",
        DatabaseName: "default",
        TableName: "missing",
      }),
    ).rejects.toThrow("Table default.missing not found");
    harness.close();
  });

  test("ListTableMetadata groups columns by table and applies the filter", async () => {
    const trino = new MetadataTrino(() => ({
      columns: columnColumns,
      data: [
        ["events", "id", "integer"],
        ["events", "label", "varchar"],
        ["orders", "total", "double"],
      ],
    }));
    const harness = createFacadeHarness({ trino });

    const all = await harness.service.ListTableMetadata({
      CatalogName: "AwsDataCatalog",
      DatabaseName: "default",
    });
    const tables = all.TableMetadataList as ReadonlyArray<{
      Name: string;
      Columns: ReadonlyArray<{ Name: string }>;
    }>;
    expect(tables.map((table) => table.Name)).toEqual(["events", "orders"]);
    expect(tables[0]?.Columns.map((column) => column.Name)).toEqual([
      "id",
      "label",
    ]);

    const filtered = await harness.service.ListTableMetadata({
      CatalogName: "AwsDataCatalog",
      DatabaseName: "default",
      Expression: "order",
    });
    const filteredTables = filtered.TableMetadataList as ReadonlyArray<{
      Name: string;
    }>;
    expect(filteredTables.map((table) => table.Name)).toEqual(["orders"]);
    harness.close();
  });
});

// In Athena you register an external table and repair partitions via
// StartQueryExecution DDL/CALL — there is no separate API. Verify those zero-row
// statements run cleanly to SUCCEEDED through the same facade path.
describe("external-table registration and partition sync (DDL/CALL)", () => {
  test.each([
    "CREATE TABLE briefcase_analytics.events (type varchar, dt varchar) WITH (format = 'JSON', external_location = 's3://briefcase-analytics/events/', partitioned_by = ARRAY['dt'])",
    "CALL system.sync_partition_metadata('briefcase_analytics', 'events', 'FULL')",
  ])("runs %s to SUCCEEDED with no result rows", async (sql) => {
    const trino = new FakeTrino({
      queryId: "ddl-1",
      // A DDL/CALL statement returns no columns and no rows.
      page: { id: "ddl-1", stats: { state: "FINISHED" } },
    });
    const harness = createFacadeHarness({ trino });

    const started = await harness.service.StartQueryExecution({
      QueryString: sql,
    });
    expect(trino.submissions).toEqual([sql]);
    expect(harness.repository.findById(started.QueryExecutionId!)?.state).toBe(
      "SUCCEEDED",
    );

    const execution = harness.service.GetQueryExecution({
      QueryExecutionId: started.QueryExecutionId!,
    });
    expect(
      (execution.QueryExecution as { Status: { State: string } }).Status.State,
    ).toBe("SUCCEEDED");

    harness.close();
  });
});

// Athena clients set the database per request via QueryExecutionContext; the
// facade must map it to the Trino schema (and the catalog) for that query, not
// only honor a startup default.
describe("per-query database/catalog context", () => {
  const finished = () =>
    new FakeTrino({
      queryId: "q",
      page: {
        id: "q",
        columns: [{ name: "n", type: "integer" }],
        data: [[1]],
        stats: { state: "FINISHED" },
      },
    });

  test("maps QueryExecutionContext.Database to the Trino schema", async () => {
    const trino = finished();
    const harness = createFacadeHarness({ trino });
    await harness.service.StartQueryExecution({
      QueryString: "select * from events",
      QueryExecutionContext: {
        Catalog: "AwsDataCatalog",
        Database: "briefcase_analytics",
      },
    });
    expect(trino.contexts[0]).toEqual({
      catalog: "hive",
      schema: "briefcase_analytics",
    });
    harness.close();
  });

  test("falls back to the default database and maps the default catalog", async () => {
    const trino = finished();
    const harness = createFacadeHarness({ trino });
    await harness.service.StartQueryExecution({ QueryString: "select 1" });
    expect(trino.contexts[0]).toEqual({ catalog: "hive", schema: "default" });
    harness.close();
  });

  test("passes a non-default catalog through unmapped", async () => {
    const trino = finished();
    const harness = createFacadeHarness({ trino });
    await harness.service.StartQueryExecution({
      QueryString: "select 1",
      QueryExecutionContext: { Catalog: "tpch", Database: "sf1" },
    });
    expect(trino.contexts[0]).toEqual({ catalog: "tpch", schema: "sf1" });
    harness.close();
  });
});
