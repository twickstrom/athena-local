import { AthenaProtocolError } from "./errors.ts";
import type {
  BatchGetQueryExecutionInput,
  GetDatabaseInput,
  GetQueryExecutionInput,
  GetQueryResultsInput,
  GetTableMetadataInput,
  GetWorkGroupInput,
  ListDatabasesInput,
  ListQueryExecutionsInput,
  ListTableMetadataInput,
  ListWorkGroupsInput,
  StartQueryExecutionInput,
  StopQueryExecutionInput,
} from "./athena-types.ts";

export function validateStartQueryExecutionInput(
  input: unknown,
): StartQueryExecutionInput {
  const object = expectObject(input);
  const queryString = expectString(object.QueryString, "QueryString");

  return removeUndefined({
    QueryString: queryString,
    ClientRequestToken: optionalString(
      object.ClientRequestToken,
      "ClientRequestToken",
    ),
    QueryExecutionContext: optionalContext(object.QueryExecutionContext),
    ResultConfiguration: optionalResultConfiguration(
      object.ResultConfiguration,
    ),
    WorkGroup: optionalString(object.WorkGroup, "WorkGroup"),
    ExecutionParameters: optionalStringArray(
      object.ExecutionParameters,
      "ExecutionParameters",
    ),
  }) as StartQueryExecutionInput;
}

export function validateGetQueryExecutionInput(
  input: unknown,
): GetQueryExecutionInput {
  const object = expectObject(input);
  return {
    QueryExecutionId: expectString(object.QueryExecutionId, "QueryExecutionId"),
  };
}

export function validateGetQueryResultsInput(
  input: unknown,
): GetQueryResultsInput {
  const object = expectObject(input);
  return removeUndefined({
    QueryExecutionId: expectString(object.QueryExecutionId, "QueryExecutionId"),
    NextToken: optionalString(object.NextToken, "NextToken"),
    MaxResults: optionalMaxResults(object.MaxResults),
  }) as GetQueryResultsInput;
}

export function validateStopQueryExecutionInput(
  input: unknown,
): StopQueryExecutionInput {
  const object = expectObject(input);
  return {
    QueryExecutionId: expectString(object.QueryExecutionId, "QueryExecutionId"),
  };
}

export function validateBatchGetQueryExecutionInput(
  input: unknown,
): BatchGetQueryExecutionInput {
  const object = expectObject(input);
  const ids = expectStringArray(
    object.QueryExecutionIds,
    "QueryExecutionIds",
  );
  if (ids.length === 0) {
    throw new AthenaProtocolError(
      "InvalidRequestException",
      "QueryExecutionIds must contain at least one ID.",
    );
  }
  return { QueryExecutionIds: ids };
}

export function validateListQueryExecutionsInput(
  input: unknown,
): ListQueryExecutionsInput {
  const object = expectObject(input);
  return removeUndefined({
    MaxResults: optionalMaxResults(object.MaxResults),
    NextToken: optionalString(object.NextToken, "NextToken"),
    WorkGroup: optionalString(object.WorkGroup, "WorkGroup"),
  }) as ListQueryExecutionsInput;
}

export function validateGetWorkGroupInput(input: unknown): GetWorkGroupInput {
  const object = expectObject(input);
  return { WorkGroup: expectString(object.WorkGroup, "WorkGroup") };
}

export function validateListWorkGroupsInput(
  input: unknown,
): ListWorkGroupsInput {
  const object = expectObject(input);
  return removeUndefined({
    MaxResults: optionalMaxResults(object.MaxResults),
    NextToken: optionalString(object.NextToken, "NextToken"),
  }) as ListWorkGroupsInput;
}

export function validateGetDatabaseInput(input: unknown): GetDatabaseInput {
  const object = expectObject(input);
  return {
    CatalogName: expectString(object.CatalogName, "CatalogName"),
    DatabaseName: expectIdentifier(object.DatabaseName, "DatabaseName"),
  };
}

export function validateListDatabasesInput(
  input: unknown,
): ListDatabasesInput {
  const object = expectObject(input);
  return removeUndefined({
    CatalogName: expectString(object.CatalogName, "CatalogName"),
    MaxResults: optionalMaxResults(object.MaxResults),
    NextToken: optionalString(object.NextToken, "NextToken"),
  }) as ListDatabasesInput;
}

export function validateGetTableMetadataInput(
  input: unknown,
): GetTableMetadataInput {
  const object = expectObject(input);
  return {
    CatalogName: expectString(object.CatalogName, "CatalogName"),
    DatabaseName: expectIdentifier(object.DatabaseName, "DatabaseName"),
    TableName: expectIdentifier(object.TableName, "TableName"),
  };
}

export function validateListTableMetadataInput(
  input: unknown,
): ListTableMetadataInput {
  const object = expectObject(input);
  return removeUndefined({
    CatalogName: expectString(object.CatalogName, "CatalogName"),
    DatabaseName: expectIdentifier(object.DatabaseName, "DatabaseName"),
    Expression: optionalString(object.Expression, "Expression"),
    MaxResults: optionalMaxResults(object.MaxResults),
    NextToken: optionalString(object.NextToken, "NextToken"),
  }) as ListTableMetadataInput;
}

function optionalContext(value: unknown):
  | StartQueryExecutionInput["QueryExecutionContext"]
  | undefined {
  if (value === undefined) {
    return undefined;
  }
  const object = expectObject(value, "QueryExecutionContext");
  return removeUndefined({
    Database: optionalString(object.Database, "QueryExecutionContext.Database"),
    Catalog: optionalString(object.Catalog, "QueryExecutionContext.Catalog"),
  }) as StartQueryExecutionInput["QueryExecutionContext"];
}

function optionalResultConfiguration(value: unknown):
  | StartQueryExecutionInput["ResultConfiguration"]
  | undefined {
  if (value === undefined) {
    return undefined;
  }
  const object = expectObject(value, "ResultConfiguration");
  return removeUndefined({
    OutputLocation: optionalString(
      object.OutputLocation,
      "ResultConfiguration.OutputLocation",
    ),
  }) as StartQueryExecutionInput["ResultConfiguration"];
}

function optionalStringArray(
  value: unknown,
  field: string,
): readonly string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new AthenaProtocolError(
      "InvalidRequestException",
      `${field} must be an array of strings.`,
    );
  }
  return value;
}

function optionalMaxResults(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new AthenaProtocolError(
      "InvalidRequestException",
      "MaxResults must be a positive integer.",
    );
  }
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return expectString(value, field);
}

function expectString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new AthenaProtocolError(
      "InvalidRequestException",
      `${field} must be a non-empty string.`,
    );
  }
  return value;
}

function expectStringArray(value: unknown, field: string): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || item.length === 0)
  ) {
    throw new AthenaProtocolError(
      "InvalidRequestException",
      `${field} must be an array of non-empty strings.`,
    );
  }
  return value;
}

// Database and table names are interpolated into Trino information_schema
// queries, so they are restricted to the catalog identifier grammar (letters,
// digits, underscores). This matches Athena/Hive naming rules and removes any
// SQL-injection surface from metadata lookups.
const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

function expectIdentifier(value: unknown, field: string): string {
  const text = expectString(value, field);
  if (!identifierPattern.test(text)) {
    throw new AthenaProtocolError(
      "InvalidRequestException",
      `${field} must contain only letters, digits, and underscores.`,
    );
  }
  return text;
}

function expectObject(
  value: unknown,
  field = "request body",
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AthenaProtocolError(
      "InvalidRequestException",
      `${field} must be an object.`,
    );
  }
  return value as Record<string, unknown>;
}

function removeUndefined<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter((entry) => entry[1] !== undefined),
  ) as T;
}
