export interface TrinoClientConfig {
  readonly endpoint: string;
  readonly user: string;
  readonly catalog: string;
  readonly schema?: string;
}

export interface TrinoColumn {
  readonly name: string;
  readonly type: string;
}

export interface TrinoStats {
  readonly state: string;
  readonly processedBytes?: number;
  readonly processedRows?: number;
  readonly queued?: boolean;
  readonly scheduled?: boolean;
  readonly completedSplits?: number;
  readonly totalSplits?: number;
}

export interface TrinoError {
  readonly message: string;
  readonly errorName: string;
  readonly errorType: string;
  readonly errorCode?: number;
  readonly failureInfo?: unknown;
}

export interface TrinoPage {
  readonly id: string;
  readonly infoUri?: string;
  readonly nextUri?: string;
  readonly columns?: readonly TrinoColumn[];
  readonly data?: readonly (readonly unknown[])[];
  readonly stats: TrinoStats;
  readonly error?: TrinoError;
}

export interface TrinoQuerySubmission {
  readonly page: TrinoPage;
  readonly queryId: string;
  readonly nextUri?: string;
}
