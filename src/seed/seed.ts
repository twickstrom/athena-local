// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import type { TrinoClient } from "../trino/client.ts";
import { mapTrinoStatsToQueryState } from "../trino/error-mapping.ts";
import type { TrinoPage } from "../trino/types.ts";

export interface SeedExecutor {
  readonly execute: (sql: string) => Promise<void>;
}

export interface SeedResult {
  readonly statements: readonly string[];
}

export function createDefaultSeedStatements(input: {
  readonly catalog?: string;
  readonly schema?: string;
  readonly warehouseLocation?: string;
} = {}): readonly string[] {
  const catalog = input.catalog ?? "hive";
  const schema = input.schema ?? "default";
  const warehouse = input.warehouseLocation ?? "s3a://athena-local/warehouse/default";

  return [
    `CREATE SCHEMA IF NOT EXISTS ${catalog}.${schema} WITH (location = '${warehouse}')`,
    `CREATE TABLE IF NOT EXISTS ${catalog}.${schema}.athena_local_smoke AS SELECT * FROM (VALUES (1, 'one'), (2, 'two'), (3, 'three')) AS t(id, label)`,
  ];
}

export async function seedLocalCatalog(
  executor: SeedExecutor,
  statements: readonly string[] = createDefaultSeedStatements(),
): Promise<SeedResult> {
  for (const statement of statements) {
    await executor.execute(statement);
  }
  return { statements };
}

export function createTrinoSeedExecutor(
  trino: Pick<TrinoClient, "submit" | "fetchNext">,
): SeedExecutor {
  return {
    execute: async (sql) => {
      const submission = await trino.submit(sql);
      await waitForTrinoCompletion(trino, submission.page);
    },
  };
}

async function waitForTrinoCompletion(
  trino: Pick<TrinoClient, "fetchNext">,
  firstPage: TrinoPage,
): Promise<void> {
  let page = firstPage;
  while (true) {
    if (page.error !== undefined) {
      throw new Error(page.error.message);
    }
    if (page.nextUri === undefined) {
      const state = mapTrinoStatsToQueryState(page.stats);
      if (state !== "SUCCEEDED") {
        throw new Error(`Seed statement did not finish successfully: ${page.stats.state}`);
      }
      return;
    }
    page = await trino.fetchNext(page.nextUri);
  }
}
