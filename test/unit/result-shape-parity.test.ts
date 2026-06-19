// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import { describe, expect, test } from "bun:test";
import { buildAthenaResultSet, formatCell } from "../../src/results/rows.ts";

// Pins the Trino->Athena result mapping to the exact shapes a positional reader
// (cells[i]?.VarCharValue ?? "") depends on.
describe("Athena result-shape parity", () => {
  test("maps the golden rows exactly (header, null, bigint, json varchar)", () => {
    const result = buildAthenaResultSet({
      columns: [
        { name: "type", type: "varchar" },
        { name: "slide_slug", type: "varchar" },
        { name: "ts", type: "bigint" },
        { name: "details", type: "varchar" },
      ],
      rows: [
        ["slide_entered", "intro", 1781815826221, '{"durationMs":4000}'],
        ["heatmap_ping", null, 1781815830000, '{"x":50,"y":42}'],
      ],
    });

    expect(result.Rows).toEqual([
      {
        Data: [
          { VarCharValue: "type" },
          { VarCharValue: "slide_slug" },
          { VarCharValue: "ts" },
          { VarCharValue: "details" },
        ],
      },
      {
        Data: [
          { VarCharValue: "slide_entered" },
          { VarCharValue: "intro" },
          { VarCharValue: "1781815826221" },
          { VarCharValue: '{"durationMs":4000}' },
        ],
      },
      {
        // NULL slide_slug is an empty Datum: no VarCharValue key.
        Data: [
          { VarCharValue: "heatmap_ping" },
          {},
          { VarCharValue: "1781815830000" },
          { VarCharValue: '{"x":50,"y":42}' },
        ],
      },
    ]);
    // The null cell must not carry a VarCharValue key at all.
    expect(Object.keys(result.Rows[2]!.Data[1]!)).toEqual([]);
  });

  test("formatCell follows Athena conventions per type", () => {
    expect(formatCell(null)).toBeUndefined();
    expect(formatCell(undefined)).toBeUndefined();
    expect(formatCell("text")).toBe("text");
    expect(formatCell(1781815826221)).toBe("1781815826221");
    expect(formatCell(9007199254740993n)).toBe("9007199254740993");
    expect(formatCell(true)).toBe("true");
    expect(formatCell(false)).toBe("false");
  });
});
