// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

export const packageName = "athena-local";
export const projectVersion = "0.0.0";

export const plannedAthenaOperations = [
  "StartQueryExecution",
  "GetQueryExecution",
  "GetQueryResults",
  "StopQueryExecution",
] as const;

export type PlannedAthenaOperation = (typeof plannedAthenaOperations)[number];
