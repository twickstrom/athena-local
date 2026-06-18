import type { Database } from "bun:sqlite";
import {
  type CreateQueryExecutionInput,
  type QueryExecutionRecord,
  type QueryState,
  type QueryStateUpdate,
} from "./types.ts";
import { assertQueryStateTransition } from "./transitions.ts";

interface QueryExecutionRow {
  readonly query_execution_id: string;
  readonly client_request_token: string | null;
  readonly query_text: string;
  readonly catalog_name: string | null;
  readonly database_name: string | null;
  readonly workgroup: string | null;
  readonly state: QueryState;
  readonly state_reason: string | null;
  readonly trino_query_id: string | null;
  readonly trino_next_uri: string | null;
  readonly output_location: string | null;
  readonly submitted_at: number;
  readonly started_at: number | null;
  readonly completed_at: number | null;
  readonly engine_execution_ms: number;
  readonly total_execution_ms: number;
  readonly scanned_bytes: number;
  readonly result_s3_uri: string | null;
  readonly result_metadata_json: string | null;
  readonly result_rows_json: string | null;
  readonly result_row_count: number;
  readonly error_json: string | null;
}

export class QueryExecutionRepository {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  createOrGetByToken(
    input: CreateQueryExecutionInput,
  ): QueryExecutionRecord {
    if (input.clientRequestToken !== undefined) {
      const existing = this.findByClientRequestToken(input.clientRequestToken);
      if (existing !== undefined) {
        return existing;
      }
    }

    const insert = this.#database.query(`
      INSERT INTO query_execution (
        query_execution_id,
        client_request_token,
        query_text,
        catalog_name,
        database_name,
        workgroup,
        state,
        output_location,
        submitted_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'QUEUED', ?, ?)
    `);

    insert.run(
      input.queryExecutionId,
      input.clientRequestToken ?? null,
      input.queryText,
      input.catalogName ?? null,
      input.databaseName ?? null,
      input.workgroup ?? null,
      input.outputLocation ?? null,
      input.submittedAt,
    );

    const created = this.findById(input.queryExecutionId);
    if (created === undefined) {
      throw new Error("Failed to create query execution record.");
    }
    return created;
  }

  findById(queryExecutionId: string): QueryExecutionRecord | undefined {
    const row = this.#database
      .query<QueryExecutionRow, [string]>(
        "SELECT * FROM query_execution WHERE query_execution_id = ?",
      )
      .get(queryExecutionId);

    return row === null ? undefined : mapRow(row);
  }

  findByClientRequestToken(
    clientRequestToken: string,
  ): QueryExecutionRecord | undefined {
    const row = this.#database
      .query<QueryExecutionRow, [string]>(
        "SELECT * FROM query_execution WHERE client_request_token = ?",
      )
      .get(clientRequestToken);

    return row === null ? undefined : mapRow(row);
  }

  updateState(
    queryExecutionId: string,
    update: QueryStateUpdate,
  ): QueryExecutionRecord {
    const current = this.findById(queryExecutionId);
    if (current === undefined) {
      throw new Error(`Unknown query execution ID: ${queryExecutionId}`);
    }

    assertQueryStateTransition(current.state, update.state);

    const startedAt =
      update.state === "RUNNING" && current.startedAt === undefined
        ? update.now
        : current.startedAt;
    const completedAt =
      update.state === "SUCCEEDED" ||
      update.state === "FAILED" ||
      update.state === "CANCELLED"
        ? update.now
        : current.completedAt;

    const statement = this.#database.query(`
      UPDATE query_execution
      SET
        state = ?,
        state_reason = ?,
        trino_query_id = ?,
        trino_next_uri = ?,
        started_at = ?,
        completed_at = ?,
        engine_execution_ms = ?,
        total_execution_ms = ?,
        scanned_bytes = ?,
        result_s3_uri = ?,
        result_metadata_json = ?,
        result_rows_json = ?,
        result_row_count = ?,
        error_json = ?
      WHERE query_execution_id = ?
    `);

    statement.run(
      update.state,
      update.stateReason ?? current.stateReason ?? null,
      update.trinoQueryId ?? current.trinoQueryId ?? null,
      update.trinoNextUri ?? current.trinoNextUri ?? null,
      startedAt ?? null,
      completedAt ?? null,
      update.engineExecutionMs ?? current.engineExecutionMs,
      update.totalExecutionMs ?? current.totalExecutionMs,
      update.scannedBytes ?? current.scannedBytes,
      update.resultS3Uri ?? current.resultS3Uri ?? null,
      update.resultMetadataJson ?? current.resultMetadataJson ?? null,
      update.resultRowsJson ?? current.resultRowsJson ?? null,
      update.resultRowCount ?? current.resultRowCount,
      update.errorJson ?? current.errorJson ?? null,
      queryExecutionId,
    );

    const updated = this.findById(queryExecutionId);
    if (updated === undefined) {
      throw new Error(`Unknown query execution ID after update: ${queryExecutionId}`);
    }
    return updated;
  }

  listNonTerminal(): readonly QueryExecutionRecord[] {
    const rows = this.#database
      .query<QueryExecutionRow, []>(
        "SELECT * FROM query_execution WHERE state IN ('QUEUED', 'RUNNING') ORDER BY submitted_at ASC",
      )
      .all();

    return rows.map(mapRow);
  }
}

function mapRow(row: QueryExecutionRow): QueryExecutionRecord {
  return removeUndefined({
    queryExecutionId: row.query_execution_id,
    clientRequestToken: row.client_request_token ?? undefined,
    queryText: row.query_text,
    catalogName: row.catalog_name ?? undefined,
    databaseName: row.database_name ?? undefined,
    workgroup: row.workgroup ?? undefined,
    state: row.state,
    stateReason: row.state_reason ?? undefined,
    trinoQueryId: row.trino_query_id ?? undefined,
    trinoNextUri: row.trino_next_uri ?? undefined,
    outputLocation: row.output_location ?? undefined,
    submittedAt: row.submitted_at,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    engineExecutionMs: row.engine_execution_ms,
    totalExecutionMs: row.total_execution_ms,
    scannedBytes: row.scanned_bytes,
    resultS3Uri: row.result_s3_uri ?? undefined,
    resultMetadataJson: row.result_metadata_json ?? undefined,
    resultRowsJson: row.result_rows_json ?? undefined,
    resultRowCount: row.result_row_count,
    errorJson: row.error_json ?? undefined,
  }) as QueryExecutionRecord;
}

function removeUndefined<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter((entry) => entry[1] !== undefined),
  ) as T;
}
