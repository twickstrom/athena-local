import type { AthenaRow, PageResult } from "./types.ts";

interface TokenPayload {
  readonly queryExecutionId: string;
  readonly offset: number;
}

export function paginateRows(input: {
  readonly queryExecutionId: string;
  readonly rows: readonly AthenaRow[];
  readonly maxResults?: number;
  readonly nextToken?: string;
}): PageResult {
  const maxResults = input.maxResults ?? 1000;
  if (!Number.isInteger(maxResults) || maxResults < 1) {
    throw new Error("MaxResults must be a positive integer.");
  }

  const offset =
    input.nextToken === undefined
      ? 0
      : decodeNextToken(input.nextToken, input.queryExecutionId);
  const pageRows = input.rows.slice(offset, offset + maxResults);
  const nextOffset = offset + pageRows.length;
  const nextToken =
    nextOffset >= input.rows.length
      ? undefined
      : encodeNextToken({
          queryExecutionId: input.queryExecutionId,
          offset: nextOffset,
        });

  return {
    rows: pageRows,
    ...(nextToken === undefined ? {} : { nextToken }),
  };
}

export function encodeNextToken(payload: TokenPayload): string {
  return btoa(JSON.stringify(payload));
}

export function decodeNextToken(
  token: string,
  expectedQueryExecutionId: string,
): number {
  let payload: unknown;
  try {
    payload = JSON.parse(atob(token));
  } catch {
    throw new Error("Invalid NextToken.");
  }

  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("Invalid NextToken.");
  }

  const object = payload as Partial<TokenPayload>;
  if (
    object.queryExecutionId !== expectedQueryExecutionId ||
    !Number.isInteger(object.offset) ||
    object.offset === undefined ||
    object.offset < 0
  ) {
    throw new Error("Invalid NextToken.");
  }

  return object.offset;
}
