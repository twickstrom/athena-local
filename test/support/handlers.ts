import type {
  AthenaOperationHandlers,
  AthenaOperationName,
} from "../../src/protocol/athena-types.ts";

const operationNames: readonly AthenaOperationName[] = [
  "StartQueryExecution",
  "GetQueryExecution",
  "GetQueryResults",
  "StopQueryExecution",
  "BatchGetQueryExecution",
  "ListQueryExecutions",
  "GetWorkGroup",
  "ListWorkGroups",
  "GetDatabase",
  "ListDatabases",
  "GetTableMetadata",
  "ListTableMetadata",
];

/**
 * Build a complete `AthenaOperationHandlers` from a partial set of overrides.
 * Any operation not provided throws if invoked, so a test only declares the
 * handlers it exercises while still satisfying the full interface.
 */
export function createHandlers(
  overrides: Partial<AthenaOperationHandlers>,
): AthenaOperationHandlers {
  const handlers = {} as Record<AthenaOperationName, unknown>;
  for (const name of operationNames) {
    handlers[name] =
      overrides[name] ??
      (() => {
        throw new Error(`Unexpected handler call: ${name}`);
      });
  }
  return handlers as unknown as AthenaOperationHandlers;
}
