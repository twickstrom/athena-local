// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import type { TrinoColumn } from "../trino/types.ts";
import { formatCell } from "./rows.ts";

export function rowsToCsv(
  columns: readonly TrinoColumn[],
  rows: readonly (readonly unknown[])[],
): string {
  const lines = [
    serializeCsvRow(columns.map((column) => column.name)),
    ...rows.map((row) => serializeCsvRow(row.map(formatCell))),
  ];
  return `${lines.join("\n")}\n`;
}

export function serializeCsvRow(values: readonly (string | undefined)[]): string {
  return values.map(serializeCsvField).join(",");
}

function serializeCsvField(value: string | undefined): string {
  if (value === undefined) {
    return "";
  }
  if (/[",\r\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}
