import type { TrinoColumn } from "../trino/types.ts";

export interface AthenaColumnInfo {
  readonly Name: string;
  readonly Type: string;
  readonly Nullable: "UNKNOWN";
  readonly CaseSensitive: boolean;
}

export interface AthenaDatum {
  readonly VarCharValue?: string;
}

export interface AthenaRow {
  readonly Data: readonly AthenaDatum[];
}

export interface AthenaResultSet {
  readonly ResultSetMetadata: {
    readonly ColumnInfo: readonly AthenaColumnInfo[];
  };
  readonly Rows: readonly AthenaRow[];
}

export interface PageResult {
  readonly rows: readonly AthenaRow[];
  readonly nextToken?: string;
}

export type ResultCell = unknown;

export interface ResultRowsInput {
  readonly columns: readonly TrinoColumn[];
  readonly rows: readonly (readonly ResultCell[])[];
}
