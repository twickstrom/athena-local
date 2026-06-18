import type {
  AthenaOperationHandlers,
  AthenaOperationName,
} from "./athena-types.ts";
import { awsError, awsJson, AthenaProtocolError, type AwsJsonResponse } from "./errors.ts";
import {
  validateBatchGetQueryExecutionInput,
  validateGetDatabaseInput,
  validateGetQueryExecutionInput,
  validateGetQueryResultsInput,
  validateGetTableMetadataInput,
  validateGetWorkGroupInput,
  validateListDatabasesInput,
  validateListQueryExecutionsInput,
  validateListTableMetadataInput,
  validateListWorkGroupsInput,
  validateStartQueryExecutionInput,
  validateStopQueryExecutionInput,
} from "./validate.ts";

export interface AwsJsonRequest {
  readonly method: string;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: unknown;
}

const targetPrefix = "AmazonAthena.";

export async function routeAthenaRequest(
  request: AwsJsonRequest,
  handlers: AthenaOperationHandlers,
): Promise<AwsJsonResponse> {
  try {
    if (request.method !== "POST") {
      throw new AthenaProtocolError("InvalidRequestException", "Not found.", 404);
    }

    const target = headerValue(request.headers, "x-amz-target");
    if (target === undefined || !target.startsWith(targetPrefix)) {
      throw new AthenaProtocolError(
        "InvalidRequestException",
        "Missing or unsupported X-Amz-Target header.",
      );
    }

    const operation = target.slice(targetPrefix.length);
    if (!isAthenaOperation(operation)) {
      throw new AthenaProtocolError(
        "InvalidRequestException",
        `Unsupported Athena operation: ${target}`,
      );
    }

    switch (operation) {
      case "StartQueryExecution":
        return awsJson(
          await handlers.StartQueryExecution(
            validateStartQueryExecutionInput(request.body),
          ),
        );
      case "GetQueryExecution":
        return awsJson(
          await handlers.GetQueryExecution(
            validateGetQueryExecutionInput(request.body),
          ),
        );
      case "GetQueryResults":
        return awsJson(
          await handlers.GetQueryResults(validateGetQueryResultsInput(request.body)),
        );
      case "StopQueryExecution":
        return awsJson(
          await handlers.StopQueryExecution(
            validateStopQueryExecutionInput(request.body),
          ),
        );
      case "BatchGetQueryExecution":
        return awsJson(
          await handlers.BatchGetQueryExecution(
            validateBatchGetQueryExecutionInput(request.body),
          ),
        );
      case "ListQueryExecutions":
        return awsJson(
          await handlers.ListQueryExecutions(
            validateListQueryExecutionsInput(request.body),
          ),
        );
      case "GetWorkGroup":
        return awsJson(
          await handlers.GetWorkGroup(validateGetWorkGroupInput(request.body)),
        );
      case "ListWorkGroups":
        return awsJson(
          await handlers.ListWorkGroups(
            validateListWorkGroupsInput(request.body),
          ),
        );
      case "GetDatabase":
        return awsJson(
          await handlers.GetDatabase(validateGetDatabaseInput(request.body)),
        );
      case "ListDatabases":
        return awsJson(
          await handlers.ListDatabases(
            validateListDatabasesInput(request.body),
          ),
        );
      case "GetTableMetadata":
        return awsJson(
          await handlers.GetTableMetadata(
            validateGetTableMetadataInput(request.body),
          ),
        );
      case "ListTableMetadata":
        return awsJson(
          await handlers.ListTableMetadata(
            validateListTableMetadataInput(request.body),
          ),
        );
    }
  } catch (error) {
    if (error instanceof AthenaProtocolError) {
      return awsError(error);
    }
    return awsError(
      new AthenaProtocolError(
        "InternalServerException",
        error instanceof Error ? error.message : "Internal server error.",
        500,
      ),
    );
  }
}

function isAthenaOperation(value: string): value is AthenaOperationName {
  return (
    value === "StartQueryExecution" ||
    value === "GetQueryExecution" ||
    value === "GetQueryResults" ||
    value === "StopQueryExecution" ||
    value === "BatchGetQueryExecution" ||
    value === "ListQueryExecutions" ||
    value === "GetWorkGroup" ||
    value === "ListWorkGroups" ||
    value === "GetDatabase" ||
    value === "ListDatabases" ||
    value === "GetTableMetadata" ||
    value === "ListTableMetadata"
  );
}

function headerValue(
  headers: Readonly<Record<string, string | undefined>>,
  name: string,
): string | undefined {
  const direct = headers[name];
  if (direct !== undefined) {
    return direct;
  }

  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) {
      return value;
    }
  }

  return undefined;
}
