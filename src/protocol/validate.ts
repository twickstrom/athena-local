import { AthenaProtocolError } from "./errors.ts";
import type {
  GetQueryExecutionInput,
  GetQueryResultsInput,
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
