export const queryStates = [
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
] as const;

export type QueryState = (typeof queryStates)[number];

export interface QueryExecutionRecord {
  readonly queryExecutionId: string;
  readonly clientRequestToken?: string;
  readonly queryText: string;
  readonly catalogName?: string;
  readonly databaseName?: string;
  readonly workgroup?: string;
  readonly state: QueryState;
  readonly stateReason?: string;
  readonly trinoQueryId?: string;
  readonly trinoNextUri?: string;
  readonly outputLocation?: string;
  readonly submittedAt: number;
  readonly startedAt?: number;
  readonly completedAt?: number;
  readonly engineExecutionMs: number;
  readonly totalExecutionMs: number;
  readonly scannedBytes: number;
  readonly resultS3Uri?: string;
  readonly resultMetadataJson?: string;
  readonly resultRowsJson?: string;
  readonly resultRowCount: number;
  readonly errorJson?: string;
}

export interface CreateQueryExecutionInput {
  readonly queryExecutionId: string;
  readonly clientRequestToken?: string;
  readonly queryText: string;
  readonly catalogName?: string;
  readonly databaseName?: string;
  readonly workgroup?: string;
  readonly outputLocation?: string;
  readonly submittedAt: number;
}

export interface QueryStateUpdate {
  readonly state: QueryState;
  readonly now: number;
  readonly stateReason?: string;
  readonly trinoQueryId?: string;
  readonly trinoNextUri?: string;
  readonly resultS3Uri?: string;
  readonly resultMetadataJson?: string;
  readonly resultRowsJson?: string;
  readonly resultRowCount?: number;
  readonly engineExecutionMs?: number;
  readonly totalExecutionMs?: number;
  readonly scannedBytes?: number;
  readonly errorJson?: string;
}

export const terminalQueryStates = new Set<QueryState>([
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
]);
