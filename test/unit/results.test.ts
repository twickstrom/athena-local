import { describe, expect, test } from "bun:test";
import { rowsToCsv } from "../../src/results/csv.ts";
import {
  decodeNextToken,
  encodeNextToken,
  paginateRows,
} from "../../src/results/pagination.ts";
import { buildAthenaResultSet } from "../../src/results/rows.ts";
import { trinoTypeToAthenaType } from "../../src/results/type-mapping.ts";

const columns = [
  { name: "id", type: "integer" },
  { name: "name", type: "varchar" },
  { name: "active", type: "boolean" },
] as const;

describe("Athena result conversion", () => {
  test("builds metadata, header row, scalar strings, and null datum objects", () => {
    const resultSet = buildAthenaResultSet({
      columns,
      rows: [[1, "Ada", true], [2, null, false]],
    });

    expect(resultSet.ResultSetMetadata.ColumnInfo).toEqual([
      {
        Name: "id",
        Type: "integer",
        Nullable: "UNKNOWN",
        CaseSensitive: true,
      },
      {
        Name: "name",
        Type: "varchar",
        Nullable: "UNKNOWN",
        CaseSensitive: true,
      },
      {
        Name: "active",
        Type: "boolean",
        Nullable: "UNKNOWN",
        CaseSensitive: true,
      },
    ]);
    expect(resultSet.Rows).toEqual([
      {
        Data: [
          { VarCharValue: "id" },
          { VarCharValue: "name" },
          { VarCharValue: "active" },
        ],
      },
      {
        Data: [
          { VarCharValue: "1" },
          { VarCharValue: "Ada" },
          { VarCharValue: "true" },
        ],
      },
      {
        Data: [{ VarCharValue: "2" }, {}, { VarCharValue: "false" }],
      },
    ]);
  });

  test("maps Trino types to Athena type labels", () => {
    expect(trinoTypeToAthenaType("integer")).toBe("integer");
    expect(trinoTypeToAthenaType("real")).toBe("float");
    expect(trinoTypeToAthenaType("decimal(10,2)")).toBe("decimal");
    expect(trinoTypeToAthenaType("array(varchar)")).toBe("array");
    expect(trinoTypeToAthenaType("map(varchar, integer)")).toBe("map");
    expect(trinoTypeToAthenaType("row(x integer)")).toBe("row");
  });
});

describe("CSV serialization", () => {
  test("serializes headers, nulls, commas, quotes, and newlines", () => {
    expect(
      rowsToCsv(
        [
          { name: "id", type: "integer" },
          { name: "note", type: "varchar" },
        ],
        [
          [1, "simple"],
          [2, null],
          [3, 'quote " and comma,'],
          [4, "line\nbreak"],
        ],
      ),
    ).toBe('id,note\n1,simple\n2,\n3,"quote "" and comma,"\n4,"line\nbreak"\n');
  });
});

describe("result pagination", () => {
  const rows = [
    { Data: [{ VarCharValue: "header" }] },
    { Data: [{ VarCharValue: "a" }] },
    { Data: [{ VarCharValue: "b" }] },
  ];

  test("returns pages and opaque next tokens", () => {
    const first = paginateRows({
      queryExecutionId: "query-1",
      rows,
      maxResults: 2,
    });

    expect(first.rows).toEqual(rows.slice(0, 2));
    expect(first.nextToken).toBeDefined();
    if (first.nextToken === undefined) {
      throw new Error("Expected first page to include NextToken.");
    }

    const second = paginateRows({
      queryExecutionId: "query-1",
      rows,
      maxResults: 2,
      nextToken: first.nextToken,
    });

    expect(second.rows).toEqual(rows.slice(2));
    expect(second.nextToken).toBeUndefined();
  });

  test("rejects tokens for another query", () => {
    const token = encodeNextToken({
      queryExecutionId: "query-1",
      offset: 1,
    });

    expect(() => decodeNextToken(token, "query-2")).toThrow("Invalid NextToken.");
  });
});
