export interface StartQueryExecutionInput {
  readonly QueryString: string;
  readonly ClientRequestToken?: string;
  readonly QueryExecutionContext?: {
    readonly Database?: string;
    readonly Catalog?: string;
  };
  readonly ResultConfiguration?: {
    readonly OutputLocation?: string;
  };
  readonly WorkGroup?: string;
  readonly ExecutionParameters?: readonly string[];
}

export interface StartQueryExecutionOutput {
  readonly QueryExecutionId: string;
}

export interface GetQueryExecutionInput {
  readonly QueryExecutionId: string;
}

export interface GetQueryExecutionOutput {
  readonly QueryExecution: unknown;
}

export interface GetQueryResultsInput {
  readonly QueryExecutionId: string;
  readonly NextToken?: string;
  readonly MaxResults?: number;
}

export interface GetQueryResultsOutput {
  readonly ResultSet: unknown;
  readonly NextToken?: string;
}

export interface StopQueryExecutionInput {
  readonly QueryExecutionId: string;
}

export type StopQueryExecutionOutput = Record<string, never>;

export interface AthenaOperationHandlers {
  readonly StartQueryExecution: (
    input: StartQueryExecutionInput,
  ) => Promise<StartQueryExecutionOutput> | StartQueryExecutionOutput;
  readonly GetQueryExecution: (
    input: GetQueryExecutionInput,
  ) => Promise<GetQueryExecutionOutput> | GetQueryExecutionOutput;
  readonly GetQueryResults: (
    input: GetQueryResultsInput,
  ) => Promise<GetQueryResultsOutput> | GetQueryResultsOutput;
  readonly StopQueryExecution: (
    input: StopQueryExecutionInput,
  ) => Promise<StopQueryExecutionOutput> | StopQueryExecutionOutput;
}

export type AthenaOperationName = keyof AthenaOperationHandlers;
