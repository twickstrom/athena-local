// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

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

export interface BatchGetQueryExecutionInput {
  readonly QueryExecutionIds: readonly string[];
}

export interface BatchGetQueryExecutionOutput {
  readonly QueryExecutions: readonly unknown[];
  readonly UnprocessedQueryExecutionIds: readonly unknown[];
}

export interface ListQueryExecutionsInput {
  readonly MaxResults?: number;
  readonly NextToken?: string;
  readonly WorkGroup?: string;
}

export interface ListQueryExecutionsOutput {
  readonly QueryExecutionIds: readonly string[];
  readonly NextToken?: string;
}

export interface GetWorkGroupInput {
  readonly WorkGroup: string;
}

export interface GetWorkGroupOutput {
  readonly WorkGroup: unknown;
}

export interface ListWorkGroupsInput {
  readonly MaxResults?: number;
  readonly NextToken?: string;
}

export interface ListWorkGroupsOutput {
  readonly WorkGroups: readonly unknown[];
  readonly NextToken?: string;
}

export interface GetDatabaseInput {
  readonly CatalogName: string;
  readonly DatabaseName: string;
}

export interface GetDatabaseOutput {
  readonly Database: unknown;
}

export interface ListDatabasesInput {
  readonly CatalogName: string;
  readonly MaxResults?: number;
  readonly NextToken?: string;
}

export interface ListDatabasesOutput {
  readonly DatabaseList: readonly unknown[];
  readonly NextToken?: string;
}

export interface GetTableMetadataInput {
  readonly CatalogName: string;
  readonly DatabaseName: string;
  readonly TableName: string;
}

export interface GetTableMetadataOutput {
  readonly TableMetadata: unknown;
}

export interface ListTableMetadataInput {
  readonly CatalogName: string;
  readonly DatabaseName: string;
  readonly Expression?: string;
  readonly MaxResults?: number;
  readonly NextToken?: string;
}

export interface ListTableMetadataOutput {
  readonly TableMetadataList: readonly unknown[];
  readonly NextToken?: string;
}

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
  readonly BatchGetQueryExecution: (
    input: BatchGetQueryExecutionInput,
  ) => Promise<BatchGetQueryExecutionOutput> | BatchGetQueryExecutionOutput;
  readonly ListQueryExecutions: (
    input: ListQueryExecutionsInput,
  ) => Promise<ListQueryExecutionsOutput> | ListQueryExecutionsOutput;
  readonly GetWorkGroup: (
    input: GetWorkGroupInput,
  ) => Promise<GetWorkGroupOutput> | GetWorkGroupOutput;
  readonly ListWorkGroups: (
    input: ListWorkGroupsInput,
  ) => Promise<ListWorkGroupsOutput> | ListWorkGroupsOutput;
  readonly GetDatabase: (
    input: GetDatabaseInput,
  ) => Promise<GetDatabaseOutput> | GetDatabaseOutput;
  readonly ListDatabases: (
    input: ListDatabasesInput,
  ) => Promise<ListDatabasesOutput> | ListDatabasesOutput;
  readonly GetTableMetadata: (
    input: GetTableMetadataInput,
  ) => Promise<GetTableMetadataOutput> | GetTableMetadataOutput;
  readonly ListTableMetadata: (
    input: ListTableMetadataInput,
  ) => Promise<ListTableMetadataOutput> | ListTableMetadataOutput;
}

export type AthenaOperationName = keyof AthenaOperationHandlers;
