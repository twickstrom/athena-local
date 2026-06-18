// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import { AthenaClient } from "@aws-sdk/client-athena";
import { HttpResponse } from "@smithy/core/protocols";
import type { HttpRequest } from "@smithy/core/protocols";
import type { HttpHandlerOptions } from "@smithy/types";
import { AthenaFacadeService } from "../../src/facade/service.ts";
import type { AthenaOperationHandlers } from "../../src/protocol/athena-types.ts";
import { createAthenaHttpHandler } from "../../src/server/http.ts";
import { openStateDatabase } from "../../src/state/database.ts";
import { QueryExecutionRepository } from "../../src/state/repository.ts";
import type {
  DeletePrefixScope,
  ObjectLocation,
  StorageBackend,
  StorageWriteInput,
} from "../../src/storage/types.ts";
import type { TrinoClient } from "../../src/trino/client.ts";
import type {
  TrinoColumn,
  TrinoPage,
  TrinoQuerySubmission,
} from "../../src/trino/types.ts";

export type TrinoLike = Pick<TrinoClient, "submit" | "fetchNext" | "cancel">;

/**
 * In-memory storage backend that records writes and can serve them back, so
 * tests can assert on materialized result objects without MinIO or S3.
 */
export class FakeStorage implements StorageBackend {
  readonly kind = "minio";
  readonly writes: StorageWriteInput[] = [];
  readonly #objects = new Map<string, Uint8Array>();

  async write(input: StorageWriteInput): Promise<void> {
    this.writes.push(input);
    const body =
      typeof input.body === "string"
        ? new TextEncoder().encode(input.body)
        : input.body instanceof Uint8Array
          ? input.body
          : new Uint8Array(await input.body.arrayBuffer());
    this.#objects.set(`${input.location.bucket}/${input.location.key}`, body);
  }

  async read(location: ObjectLocation): Promise<Uint8Array> {
    const body = this.#objects.get(`${location.bucket}/${location.key}`);
    if (body === undefined) {
      throw new Error(`Missing fake object: ${location.bucket}/${location.key}`);
    }
    return body;
  }

  async exists(location: ObjectLocation): Promise<boolean> {
    return this.#objects.has(`${location.bucket}/${location.key}`);
  }

  async deletePrefix(_scope: DeletePrefixScope): Promise<void> {
    throw new Error("Not implemented in fake.");
  }
}

/**
 * Scripted Trino client. The submission is returned from `submit`; any pages
 * reachable through `nextUri` are served from `pages`. This lets a test model
 * the full submit/poll lifecycle deterministically.
 */
export class FakeTrino {
  readonly submissions: string[] = [];
  readonly cancellations: string[] = [];
  submission: TrinoQuerySubmission;
  pages = new Map<string, TrinoPage>();

  constructor(submission: TrinoQuerySubmission) {
    this.submission = submission;
  }

  async submit(sql: string): Promise<TrinoQuerySubmission> {
    this.submissions.push(sql);
    return this.submission;
  }

  async fetchNext(nextUri: string): Promise<TrinoPage> {
    const page = this.pages.get(nextUri);
    if (page === undefined) {
      throw new Error(`Missing fake page: ${nextUri}`);
    }
    return page;
  }

  async cancel(nextUri: string): Promise<void> {
    this.cancellations.push(nextUri);
  }
}

/**
 * Single-page Trino stand-in for metadata queries: each submitted SQL string is
 * mapped to a column/row response, so information_schema lookups can be scripted
 * deterministically. Pagination is not used by metadata queries.
 */
export class MetadataTrino {
  readonly queries: string[] = [];

  constructor(
    private readonly responder: (sql: string) => {
      readonly columns: readonly TrinoColumn[];
      readonly data: readonly (readonly unknown[])[];
    },
  ) {}

  async submit(sql: string): Promise<TrinoQuerySubmission> {
    this.queries.push(sql);
    const { columns, data } = this.responder(sql);
    return {
      queryId: "metadata-query",
      page: {
        id: "metadata-query",
        columns,
        data,
        stats: { state: "FINISHED" },
      },
    };
  }

  async fetchNext(): Promise<TrinoPage> {
    throw new Error("MetadataTrino does not paginate.");
  }

  async cancel(): Promise<void> {}
}

export interface FacadeHarness {
  readonly service: AthenaFacadeService;
  readonly repository: QueryExecutionRepository;
  readonly storage: FakeStorage;
  readonly close: () => void;
}

/**
 * Build a real `AthenaFacadeService` backed by a real SQLite repository (on
 * disk when `statePath` is supplied), a fake Trino, and a fake storage
 * backend. Clock and id generators are deterministic.
 */
export function createFacadeHarness(options: {
  readonly trino: TrinoLike;
  readonly storage?: FakeStorage;
  readonly statePath?: string;
}): FacadeHarness {
  const storage = options.storage ?? new FakeStorage();
  const state = openStateDatabase(options.statePath ?? ":memory:");
  const repository = new QueryExecutionRepository(state.database);
  let now = 100;
  let queryId = 1;
  let tokenId = 1;

  const service = new AthenaFacadeService({
    repository,
    trino: options.trino,
    storage,
    clock: {
      now: () => {
        now += 10;
        return now;
      },
    },
    ids: {
      queryExecutionId: () => `query-${queryId++}`,
      clientRequestToken: () => `token-${tokenId++}`,
    },
    config: {
      defaultCatalog: "AwsDataCatalog",
      defaultDatabase: "default",
      defaultWorkgroup: "primary",
      defaultOutputLocation: "s3://athena-local-results/local/",
    },
  });

  return { service, repository, storage, close: state.close };
}

/**
 * Construct a real AWS SDK v3 `AthenaClient` whose transport is wired directly
 * to the in-process Athena HTTP handler. Requests go through the genuine SDK
 * serialization/deserialization middleware, exactly as an application would.
 */
export function createSdkClient(handlers: AthenaOperationHandlers): AthenaClient {
  const handler = createAthenaHttpHandler({ handlers });

  return new AthenaClient({
    endpoint: "http://127.0.0.1:4567",
    region: "us-east-1",
    credentials: {
      accessKeyId: "local",
      secretAccessKey: "local-secret",
    },
    requestHandler: {
      handle: async (request: HttpRequest, _options?: HttpHandlerOptions) => {
        const response = await handler(
          new Request(
            `${request.protocol}//${request.hostname}${request.path}`,
            {
              method: request.method,
              headers: request.headers,
              body: request.body,
            },
          ),
        );

        return {
          response: new HttpResponse({
            statusCode: response.status,
            headers: Object.fromEntries(response.headers.entries()),
            body: await response.bytes(),
          }),
        };
      },
      updateHttpClientConfig: () => {},
      httpHandlerConfigs: () => ({}),
    },
  });
}
