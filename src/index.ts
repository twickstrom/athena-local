export const packageName = "athena-local";
export const projectStatus = "pre-alpha-planning";

export const plannedAthenaOperations = [
  "StartQueryExecution",
  "GetQueryExecution",
  "GetQueryResults",
  "StopQueryExecution",
] as const;

export type PlannedAthenaOperation = (typeof plannedAthenaOperations)[number];
