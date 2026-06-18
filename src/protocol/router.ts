import type {
  AthenaOperationHandlers,
  AthenaOperationName,
} from "./athena-types.ts";
import { awsError, awsJson, AthenaProtocolError, type AwsJsonResponse } from "./errors.ts";
import {
  validateGetQueryExecutionInput,
  validateGetQueryResultsInput,
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
    value === "StopQueryExecution"
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
