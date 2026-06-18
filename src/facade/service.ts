import type {
  AthenaOperationHandlers,
  GetQueryExecutionOutput,
  GetQueryResultsOutput,
  StartQueryExecutionInput,
  StartQueryExecutionOutput,
  StopQueryExecutionOutput,
} from "../protocol/athena-types.ts";
import { AthenaProtocolError } from "../protocol/errors.ts";
import { buildAthenaResultSet } from "../results/rows.ts";
import { materializeCsvResult } from "../results/materialize.ts";
import { paginateRows } from "../results/pagination.ts";
import type { AthenaRow } from "../results/types.ts";
import { QueryExecutionRepository } from "../state/repository.ts";
import { terminalQueryStates, type QueryExecutionRecord } from "../state/types.ts";
import type { StorageBackend } from "../storage/types.ts";
import { mapTrinoError } from "../trino/error-mapping.ts";
import type { TrinoClient } from "../trino/client.ts";
import type { TrinoColumn } from "../trino/types.ts";
import { parseS3OutputLocation } from "./output-location.ts";

export interface AthenaFacadeClock {
  readonly now: () => number;
}

export interface AthenaFacadeIds {
  readonly queryExecutionId: () => string;
  readonly clientRequestToken: () => string;
}

export interface AthenaFacadeConfig {
  readonly defaultCatalog: string;
  readonly defaultDatabase: string;
  readonly defaultWorkgroup: string;
  readonly defaultOutputLocation: string;
}

export interface AthenaFacadeDependencies {
  readonly repository: QueryExecutionRepository;
  readonly trino: Pick<TrinoClient, "submit" | "fetchNext" | "cancel">;
  readonly storage: StorageBackend;
  readonly clock: AthenaFacadeClock;
  readonly ids: AthenaFacadeIds;
  readonly config: AthenaFacadeConfig;
}

export class AthenaFacadeService implements AthenaOperationHandlers {
  readonly #repository: QueryExecutionRepository;
  readonly #trino: Pick<TrinoClient, "submit" | "fetchNext" | "cancel">;
  readonly #storage: StorageBackend;
  readonly #clock: AthenaFacadeClock;
  readonly #ids: AthenaFacadeIds;
  readonly #config: AthenaFacadeConfig;

  constructor(dependencies: AthenaFacadeDependencies) {
    this.#repository = dependencies.repository;
    this.#trino = dependencies.trino;
    this.#storage = dependencies.storage;
    this.#clock = dependencies.clock;
    this.#ids = dependencies.ids;
    this.#config = dependencies.config;
  }

  async StartQueryExecution(
    input: StartQueryExecutionInput,
  ): Promise<StartQueryExecutionOutput> {
    const token = input.ClientRequestToken ?? this.#ids.clientRequestToken();
    const outputLocation =
      input.ResultConfiguration?.OutputLocation ??
      this.#config.defaultOutputLocation;
    const created = this.#repository.createOrGetByToken({
      queryExecutionId: this.#ids.queryExecutionId(),
      clientRequestToken: token,
      queryText: input.QueryString,
      catalogName: input.QueryExecutionContext?.Catalog ?? this.#config.defaultCatalog,
      databaseName:
        input.QueryExecutionContext?.Database ?? this.#config.defaultDatabase,
      workgroup: input.WorkGroup ?? this.#config.defaultWorkgroup,
      outputLocation,
      submittedAt: this.#clock.now(),
    });

    if (created.state !== "QUEUED") {
      return {
        QueryExecutionId: created.queryExecutionId,
      };
    }

    await this.#execute(created);

    return {
      QueryExecutionId: created.queryExecutionId,
    };
  }

  GetQueryExecution(input: {
    readonly QueryExecutionId: string;
  }): GetQueryExecutionOutput {
    const record = this.#requireRecord(input.QueryExecutionId);
    return {
      QueryExecution: {
        QueryExecutionId: record.queryExecutionId,
        Query: record.queryText,
        ResultConfiguration: {
          OutputLocation: record.resultS3Uri ?? record.outputLocation,
        },
        QueryExecutionContext: removeUndefined({
          Database: record.databaseName,
          Catalog: record.catalogName,
        }),
        Status: removeUndefined({
          State: record.state,
          StateChangeReason: record.stateReason,
          SubmissionDateTime: record.submittedAt,
          CompletionDateTime: record.completedAt,
        }),
        Statistics: {
          EngineExecutionTimeInMillis: record.engineExecutionMs,
          TotalExecutionTimeInMillis: record.totalExecutionMs,
          DataScannedInBytes: record.scannedBytes,
        },
        WorkGroup: record.workgroup,
      },
    };
  }

  GetQueryResults(input: {
    readonly QueryExecutionId: string;
    readonly NextToken?: string;
    readonly MaxResults?: number;
  }): GetQueryResultsOutput {
    const record = this.#requireRecord(input.QueryExecutionId);
    if (record.state !== "SUCCEEDED") {
      throw new AthenaProtocolError(
        "InvalidRequestException",
        `Query has not completed successfully: ${record.state}`,
      );
    }
    if (
      record.resultMetadataJson === undefined ||
      record.resultRowsJson === undefined
    ) {
      throw new AthenaProtocolError(
        "InternalServerException",
        "Query succeeded without persisted result rows.",
        500,
      );
    }

    const rows = JSON.parse(record.resultRowsJson) as AthenaRow[];
    const page = paginateRows({
      queryExecutionId: record.queryExecutionId,
      rows,
      ...(input.MaxResults === undefined ? {} : { maxResults: input.MaxResults }),
      ...(input.NextToken === undefined ? {} : { nextToken: input.NextToken }),
    });

    return removeUndefined({
      ResultSet: {
        ResultSetMetadata: JSON.parse(record.resultMetadataJson) as unknown,
        Rows: page.rows,
      },
      NextToken: page.nextToken,
    }) as GetQueryResultsOutput;
  }

  async StopQueryExecution(input: {
    readonly QueryExecutionId: string;
  }): Promise<StopQueryExecutionOutput> {
    const record = this.#requireRecord(input.QueryExecutionId);
    if (record.state === "RUNNING" && record.trinoNextUri !== undefined) {
      await this.#trino.cancel(record.trinoNextUri);
    }
    if (!terminalQueryStates.has(record.state)) {
      this.#repository.updateState(record.queryExecutionId, {
        state: "CANCELLED",
        now: this.#clock.now(),
        stateReason: "Query cancelled by StopQueryExecution.",
      });
    }
    return {};
  }

  async #execute(record: QueryExecutionRecord): Promise<void> {
    try {
      const submitted = await this.#trino.submit(record.queryText);
      this.#repository.updateState(record.queryExecutionId, {
        state: "RUNNING",
        now: this.#clock.now(),
        trinoQueryId: submitted.queryId,
        ...(submitted.nextUri === undefined
          ? {}
          : { trinoNextUri: submitted.nextUri }),
      });

      const columns: TrinoColumn[] = [];
      const rows: Array<readonly unknown[]> = [];
      let page = submitted.page;

      while (true) {
        if (page.columns !== undefined && columns.length === 0) {
          columns.push(...page.columns);
        }
        if (page.data !== undefined) {
          rows.push(...page.data);
        }
        if (page.error !== undefined) {
          const mapped = mapTrinoError(page.error);
          this.#repository.updateState(record.queryExecutionId, {
            state: mapped.state,
            now: this.#clock.now(),
            stateReason: mapped.stateReason,
            errorJson: mapped.errorJson,
          });
          return;
        }
        if (page.nextUri === undefined) {
          break;
        }
        page = await this.#trino.fetchNext(page.nextUri);
      }

      const resultSet = buildAthenaResultSet({
        columns,
        rows,
      });
      const output = parseS3OutputLocation(
        record.outputLocation ?? this.#config.defaultOutputLocation,
      );
      const materialized = await materializeCsvResult({
        storage: this.#storage,
        bucket: output.bucket,
        prefix: output.prefix,
        queryExecutionId: record.queryExecutionId,
        columns,
        rows,
      });

      this.#repository.updateState(record.queryExecutionId, {
        state: "SUCCEEDED",
        now: this.#clock.now(),
        resultS3Uri: materialized.outputLocation,
        resultMetadataJson: JSON.stringify(resultSet.ResultSetMetadata),
        resultRowsJson: JSON.stringify(resultSet.Rows),
        resultRowCount: materialized.rowCount,
        scannedBytes: page.stats.processedBytes ?? 0,
      });
    } catch (error) {
      this.#repository.updateState(record.queryExecutionId, {
        state: "FAILED",
        now: this.#clock.now(),
        stateReason: error instanceof Error ? error.message : "Query failed.",
        errorJson: JSON.stringify({
          message: error instanceof Error ? error.message : "Query failed.",
        }),
      });
    }
  }

  #requireRecord(queryExecutionId: string): QueryExecutionRecord {
    const record = this.#repository.findById(queryExecutionId);
    if (record === undefined) {
      throw new AthenaProtocolError(
        "InvalidRequestException",
        `Unknown query execution ID: ${queryExecutionId}`,
      );
    }
    return record;
  }
}

function removeUndefined<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter((entry) => entry[1] !== undefined),
  ) as T;
}
