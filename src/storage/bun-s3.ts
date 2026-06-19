// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import type {
  DeletePrefixScope,
  ObjectLocation,
  StorageBackend,
  StorageBackendKind,
  StorageWriteInput,
} from "./types.ts";
import {
  validateDeletePrefix,
  validateObjectLocation,
} from "./safety.ts";

export interface BunS3StorageOptions {
  readonly kind: StorageBackendKind;
  readonly bucket: string;
  readonly endpoint?: string;
  readonly region?: string;
  readonly accessKeyId?: string;
  readonly secretAccessKey?: string;
  readonly sessionToken?: string;
}

export class BunS3Storage implements StorageBackend {
  readonly kind: StorageBackendKind;
  readonly #bucket: string;
  readonly #client: Bun.S3Client;

  constructor(options: BunS3StorageOptions) {
    this.kind = options.kind;
    this.#bucket = options.bucket;
    this.#client = new Bun.S3Client(
      removeUndefined({
        bucket: options.bucket,
        endpoint: options.endpoint,
        region: options.region,
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
        sessionToken: options.sessionToken,
      }),
    );
  }

  async write(input: StorageWriteInput): Promise<void> {
    this.#assertBucket(input.location.bucket);
    assertNoSafetyIssues(validateObjectLocation(input.location));

    await this.#client.write(input.location.key, input.body, {
      type: input.contentType,
    });
  }

  async read(location: ObjectLocation): Promise<Uint8Array> {
    this.#assertBucket(location.bucket);
    assertNoSafetyIssues(validateObjectLocation(location));

    const arrayBuffer = await this.#client.file(location.key).arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  async exists(location: ObjectLocation): Promise<boolean> {
    this.#assertBucket(location.bucket);
    assertNoSafetyIssues(validateObjectLocation(location));

    return this.#client.exists(location.key);
  }

  async deletePrefix(scope: DeletePrefixScope): Promise<void> {
    this.#assertBucket(scope.bucket);
    assertNoSafetyIssues(validateDeletePrefix(scope));

    let startAfter: string | undefined;
    while (true) {
      const listed = await this.#client.list(
        removeUndefined({
          prefix: scope.prefix,
          maxKeys: 1000,
          startAfter,
        }),
      );
      const keys =
        listed.contents
          ?.map((content) => content.key)
          .filter((key): key is string => key !== undefined) ?? [];

      for (const key of keys) {
        await this.#client.delete(key);
      }

      if (!listed.isTruncated || keys.length === 0) {
        break;
      }
      startAfter = keys.at(-1);
    }
  }

  #assertBucket(bucket: string): void {
    if (bucket !== this.#bucket) {
      throw new Error(
        `Storage operation targets bucket "${bucket}" but athena-local writes results ` +
          `to "${this.#bucket}". Use that bucket in OutputLocation, or set ` +
          `ATHENA_OUTPUT_LOCATION / ATHENA_LOCAL_S3_BUCKET to match.`,
      );
    }
  }
}

function assertNoSafetyIssues(
  issues: readonly { readonly field: string; readonly message: string }[],
): void {
  if (issues.length > 0) {
    throw new Error(issues.map((issue) => `${issue.field}: ${issue.message}`).join("; "));
  }
}

function removeUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter((entry) => entry[1] !== undefined),
  );
}
