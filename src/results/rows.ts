// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import type { TrinoColumn } from "../trino/types.ts";
import { trinoTypeToAthenaType } from "./type-mapping.ts";
import type { AthenaColumnInfo, AthenaResultSet, AthenaRow, ResultRowsInput } from "./types.ts";

export function buildAthenaResultSet(input: ResultRowsInput): AthenaResultSet {
  const columnInfo = input.columns.map(columnToInfo);
  return {
    ResultSetMetadata: {
      ColumnInfo: columnInfo,
    },
    Rows: [headerRow(input.columns), ...input.rows.map(dataRow)],
  };
}

export function formatCell(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return JSON.stringify(value);
}

function columnToInfo(column: TrinoColumn): AthenaColumnInfo {
  return {
    Name: column.name,
    Type: trinoTypeToAthenaType(column.type),
    Nullable: "UNKNOWN",
    CaseSensitive: true,
  };
}

function headerRow(columns: readonly TrinoColumn[]): AthenaRow {
  return {
    Data: columns.map((column) => ({
      VarCharValue: column.name,
    })),
  };
}

function dataRow(row: readonly unknown[]): AthenaRow {
  return {
    Data: row.map((cell) => {
      const formatted = formatCell(cell);
      return formatted === undefined ? {} : { VarCharValue: formatted };
    }),
  };
}
