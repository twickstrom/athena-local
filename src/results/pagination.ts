// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

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

export interface ListPage<T> {
  readonly items: readonly T[];
  readonly nextToken?: string;
}

interface ListTokenPayload {
  readonly scope: string;
  readonly offset: number;
}

/**
 * Offset pagination for list operations (ListQueryExecutions, ListWorkGroups,
 * ListDatabases, ListTableMetadata). The opaque token is bound to a `scope`
 * string so a token issued by one operation cannot be replayed against another.
 */
export function paginateList<T>(input: {
  readonly items: readonly T[];
  readonly scope: string;
  readonly maxResults?: number;
  readonly nextToken?: string;
}): ListPage<T> {
  const maxResults = input.maxResults ?? 50;
  if (!Number.isInteger(maxResults) || maxResults < 1) {
    throw new Error("MaxResults must be a positive integer.");
  }

  const offset =
    input.nextToken === undefined
      ? 0
      : decodeListToken(input.nextToken, input.scope);
  const pageItems = input.items.slice(offset, offset + maxResults);
  const nextOffset = offset + pageItems.length;
  const nextToken =
    nextOffset >= input.items.length
      ? undefined
      : btoa(JSON.stringify({ scope: input.scope, offset: nextOffset }));

  return {
    items: pageItems,
    ...(nextToken === undefined ? {} : { nextToken }),
  };
}

function decodeListToken(token: string, expectedScope: string): number {
  let payload: unknown;
  try {
    payload = JSON.parse(atob(token));
  } catch {
    throw new Error("Invalid NextToken.");
  }
  const object = payload as Partial<ListTokenPayload>;
  if (
    typeof object !== "object" ||
    object === null ||
    object.scope !== expectedScope ||
    !Number.isInteger(object.offset) ||
    object.offset === undefined ||
    object.offset < 0
  ) {
    throw new Error("Invalid NextToken.");
  }
  return object.offset;
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
