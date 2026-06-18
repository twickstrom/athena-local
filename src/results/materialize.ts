import type { StorageBackend } from "../storage/types.ts";
import type { TrinoColumn } from "../trino/types.ts";
import { rowsToCsv } from "./csv.ts";

export interface MaterializeCsvInput {
  readonly storage: StorageBackend;
  readonly bucket: string;
  readonly prefix: string;
  readonly queryExecutionId: string;
  readonly columns: readonly TrinoColumn[];
  readonly rows: readonly (readonly unknown[])[];
}

export interface MaterializedResult {
  readonly outputLocation: string;
  readonly key: string;
  readonly rowCount: number;
}

export async function materializeCsvResult(
  input: MaterializeCsvInput,
): Promise<MaterializedResult> {
  const prefix = normalizePrefix(input.prefix);
  const key = `${prefix}${input.queryExecutionId}.csv`;
  const csv = rowsToCsv(input.columns, input.rows);

  await input.storage.write({
    location: {
      bucket: input.bucket,
      key,
    },
    contentType: "text/csv; charset=utf-8",
    body: csv,
  });

  return {
    outputLocation: `s3://${input.bucket}/${key}`,
    key,
    rowCount: input.rows.length,
  };
}

function normalizePrefix(prefix: string): string {
  const trimmed = prefix.trim();
  if (
    trimmed.length === 0 ||
    trimmed === "/" ||
    trimmed.startsWith("/") ||
    trimmed.includes("../") ||
    trimmed.includes("..\\")
  ) {
    throw new Error("Result prefix must be non-empty, relative, and scoped.");
  }
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}
