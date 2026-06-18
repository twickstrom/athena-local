import { describe, expect, test } from "bun:test";
import { materializeCsvResult } from "../../src/results/materialize.ts";
import type {
  DeletePrefixScope,
  ObjectLocation,
  StorageBackend,
  StorageWriteInput,
} from "../../src/storage/types.ts";

class FakeStorage implements StorageBackend {
  readonly kind = "minio";
  readonly writes: StorageWriteInput[] = [];

  async write(input: StorageWriteInput): Promise<void> {
    this.writes.push(input);
  }

  async read(_location: ObjectLocation): Promise<Uint8Array> {
    throw new Error("Not implemented in fake.");
  }

  async exists(_location: ObjectLocation): Promise<boolean> {
    return false;
  }

  async deletePrefix(_scope: DeletePrefixScope): Promise<void> {
    throw new Error("Not implemented in fake.");
  }
}

describe("CSV result materialization", () => {
  test("writes CSV to storage and returns an Athena-style output location", async () => {
    const storage = new FakeStorage();

    const result = await materializeCsvResult({
      storage,
      bucket: "athena-local-results",
      prefix: "local/results",
      queryExecutionId: "query-1",
      columns: [
        { name: "id", type: "integer" },
        { name: "name", type: "varchar" },
      ],
      rows: [[1, "Ada"]],
    });

    expect(result).toEqual({
      outputLocation: "s3://athena-local-results/local/results/query-1.csv",
      key: "local/results/query-1.csv",
      rowCount: 1,
    });
    expect(storage.writes).toEqual([
      {
        location: {
          bucket: "athena-local-results",
          key: "local/results/query-1.csv",
        },
        contentType: "text/csv; charset=utf-8",
        body: "id,name\n1,Ada\n",
      },
    ]);
  });

  test("rejects unsafe result prefixes", async () => {
    const storage = new FakeStorage();

    await expect(
      materializeCsvResult({
        storage,
        bucket: "athena-local-results",
        prefix: "../prod",
        queryExecutionId: "query-1",
        columns: [],
        rows: [],
      }),
    ).rejects.toThrow("Result prefix must be non-empty, relative, and scoped.");
  });
});
