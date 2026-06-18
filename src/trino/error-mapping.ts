import type { QueryState } from "../state/types.ts";
import type { TrinoError, TrinoStats } from "./types.ts";

export interface MappedTrinoError {
  readonly state: QueryState;
  readonly stateReason: string;
  readonly retryable: boolean;
  readonly errorJson: string;
}

export function mapTrinoStatsToQueryState(stats: TrinoStats): QueryState {
  switch (stats.state) {
    case "QUEUED":
      return "QUEUED";
    case "RUNNING":
    case "PLANNING":
    case "STARTING":
    case "FINISHING":
      return "RUNNING";
    case "FINISHED":
      return "SUCCEEDED";
    case "FAILED":
      return "FAILED";
    default:
      return "RUNNING";
  }
}

export function mapTrinoError(error: TrinoError): MappedTrinoError {
  return {
    state: "FAILED",
    stateReason: error.message,
    retryable: error.errorType === "EXTERNAL",
    errorJson: JSON.stringify({
      message: error.message,
      errorName: error.errorName,
      errorType: error.errorType,
      errorCode: error.errorCode,
    }),
  };
}
