// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import { Database } from "bun:sqlite";

export interface StateDatabase {
  readonly database: Database;
  readonly close: () => void;
}

export function openStateDatabase(path = ":memory:"): StateDatabase {
  const database = new Database(path, {
    create: true,
  });
  database.exec("PRAGMA foreign_keys = ON;");
  if (path !== ":memory:") {
    database.exec("PRAGMA journal_mode = WAL;");
  }
  runMigrations(database);
  return {
    database,
    close: () => database.close(),
  };
}

export function runMigrations(database: Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS query_execution (
      query_execution_id TEXT PRIMARY KEY,
      client_request_token TEXT UNIQUE,
      query_text TEXT NOT NULL,
      catalog_name TEXT,
      database_name TEXT,
      workgroup TEXT,
      state TEXT NOT NULL,
      state_reason TEXT,
      trino_query_id TEXT,
      trino_next_uri TEXT,
      output_location TEXT,
      submitted_at INTEGER NOT NULL,
      started_at INTEGER,
      completed_at INTEGER,
      engine_execution_ms INTEGER NOT NULL DEFAULT 0,
      total_execution_ms INTEGER NOT NULL DEFAULT 0,
      scanned_bytes INTEGER NOT NULL DEFAULT 0,
      result_s3_uri TEXT,
      result_metadata_json TEXT,
      result_rows_json TEXT,
      result_row_count INTEGER NOT NULL DEFAULT 0,
      error_json TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_query_execution_state
      ON query_execution(state);

    CREATE INDEX IF NOT EXISTS idx_query_execution_submitted_at
      ON query_execution(submitted_at);
  `);

  const insertVersion = database.query(
    "INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (?, ?)",
  );
  insertVersion.run(1, Date.now());
}
