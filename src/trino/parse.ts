// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import type { TrinoColumn, TrinoError, TrinoPage, TrinoStats } from "./types.ts";

export function parseTrinoPage(value: unknown): TrinoPage {
  const object = expectObject(value, "Trino response");
  const id = expectString(object.id, "id");
  const stats = parseStats(object.stats);

  return removeUndefined({
    id,
    infoUri: optionalString(object.infoUri, "infoUri"),
    nextUri: optionalString(object.nextUri, "nextUri"),
    columns: optionalColumns(object.columns),
    data: optionalData(object.data),
    stats,
    error: optionalError(object.error),
  }) as TrinoPage;
}

function parseStats(value: unknown): TrinoStats {
  const object = expectObject(value, "stats");
  return removeUndefined({
    state: expectString(object.state, "stats.state"),
    processedBytes: optionalNumber(object.processedBytes, "stats.processedBytes"),
    processedRows: optionalNumber(object.processedRows, "stats.processedRows"),
    queued: optionalBoolean(object.queued, "stats.queued"),
    scheduled: optionalBoolean(object.scheduled, "stats.scheduled"),
    completedSplits: optionalNumber(
      object.completedSplits,
      "stats.completedSplits",
    ),
    totalSplits: optionalNumber(object.totalSplits, "stats.totalSplits"),
  }) as TrinoStats;
}

function optionalColumns(value: unknown): readonly TrinoColumn[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error("columns must be an array.");
  }
  return value.map((column, index) => {
    const object = expectObject(column, `columns[${index}]`);
    return {
      name: expectString(object.name, `columns[${index}].name`),
      type: expectString(object.type, `columns[${index}].type`),
    };
  });
}

function optionalData(value: unknown): readonly (readonly unknown[])[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((row) => !Array.isArray(row))) {
    throw new Error("data must be an array of rows.");
  }
  return value as readonly (readonly unknown[])[];
}

function optionalError(value: unknown): TrinoError | undefined {
  if (value === undefined) {
    return undefined;
  }
  const object = expectObject(value, "error");
  return removeUndefined({
    message: expectString(object.message, "error.message"),
    errorName: expectString(object.errorName, "error.errorName"),
    errorType: expectString(object.errorType, "error.errorType"),
    errorCode: optionalNumber(object.errorCode, "error.errorCode"),
    failureInfo: object.failureInfo,
  }) as TrinoError;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return expectString(value, field);
}

function expectString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value;
}

function optionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number.`);
  }
  return value;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${field} must be a boolean.`);
  }
  return value;
}

function expectObject(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function removeUndefined<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter((entry) => entry[1] !== undefined),
  ) as T;
}
