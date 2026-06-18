import { describe, expect, test } from "bun:test";
import {
  validateBatchGetQueryExecutionInput,
  validateGetDatabaseInput,
  validateGetTableMetadataInput,
  validateGetWorkGroupInput,
  validateListQueryExecutionsInput,
} from "../../src/protocol/validate.ts";

describe("catalog operation validation", () => {
  test("accepts valid identifiers", () => {
    expect(
      validateGetTableMetadataInput({
        CatalogName: "AwsDataCatalog",
        DatabaseName: "sales_db",
        TableName: "orders_2024",
      }),
    ).toEqual({
      CatalogName: "AwsDataCatalog",
      DatabaseName: "sales_db",
      TableName: "orders_2024",
    });
  });

  test("rejects database and table names that are not safe identifiers", () => {
    for (const injection of [
      "default'; DROP TABLE x; --",
      "a b",
      "schema.table",
      "1bad",
      "name-with-dash",
    ]) {
      expect(() =>
        validateGetDatabaseInput({
          CatalogName: "AwsDataCatalog",
          DatabaseName: injection,
        }),
      ).toThrow("DatabaseName must contain only letters, digits, and underscores.");
    }
  });

  test("BatchGetQueryExecution requires a non-empty string array", () => {
    expect(() =>
      validateBatchGetQueryExecutionInput({ QueryExecutionIds: [] }),
    ).toThrow("at least one ID");
    expect(() =>
      validateBatchGetQueryExecutionInput({ QueryExecutionIds: ["ok", 5] }),
    ).toThrow("array of non-empty strings");
    expect(
      validateBatchGetQueryExecutionInput({ QueryExecutionIds: ["a", "b"] }),
    ).toEqual({ QueryExecutionIds: ["a", "b"] });
  });

  test("GetWorkGroup requires a workgroup name", () => {
    expect(() => validateGetWorkGroupInput({})).toThrow(
      "WorkGroup must be a non-empty string.",
    );
    expect(validateGetWorkGroupInput({ WorkGroup: "primary" })).toEqual({
      WorkGroup: "primary",
    });
  });

  test("ListQueryExecutions keeps only provided optional fields", () => {
    expect(validateListQueryExecutionsInput({})).toEqual({});
    expect(
      validateListQueryExecutionsInput({ MaxResults: 10, WorkGroup: "primary" }),
    ).toEqual({ MaxResults: 10, WorkGroup: "primary" });
    expect(() =>
      validateListQueryExecutionsInput({ MaxResults: 0 }),
    ).toThrow("MaxResults must be a positive integer.");
  });
});
