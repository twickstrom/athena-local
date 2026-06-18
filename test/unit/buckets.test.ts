// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import { describe, expect, test } from "bun:test";
import { SigV4BucketManager } from "../../src/storage/buckets.ts";

describe("S3 bucket manager", () => {
  test("creates a missing bucket with signed requests", async () => {
    const requests: Request[] = [];
    const manager = new SigV4BucketManager({
      endpoint: "http://127.0.0.1:9000",
      region: "us-east-1",
      accessKeyId: "local",
      secretAccessKey: "local-secret",
      now: () => new Date("2026-01-02T03:04:05.000Z"),
      fetch: async (input, init) => {
        const request = new Request(input.toString(), init);
        requests.push(request);
        return new Response(null, { status: request.method === "HEAD" ? 404 : 200 });
      },
    });

    await manager.ensureBucket("athena-local");

    expect(requests.map((request) => request.method)).toEqual(["HEAD", "PUT"]);
    expect(requests.map((request) => request.url)).toEqual([
      "http://127.0.0.1:9000/athena-local",
      "http://127.0.0.1:9000/athena-local",
    ]);
    expect(requests[1]?.headers.get("authorization")).toContain(
      "AWS4-HMAC-SHA256 Credential=local/20260102/us-east-1/s3/aws4_request",
    );
    expect(requests[1]?.headers.get("x-amz-date")).toBe("20260102T030405Z");
  });

  test("does not create an existing bucket", async () => {
    let calls = 0;
    const manager = new SigV4BucketManager({
      endpoint: "http://127.0.0.1:9000",
      region: "us-east-1",
      accessKeyId: "local",
      secretAccessKey: "local-secret",
      fetch: async () => {
        calls += 1;
        return new Response(null, { status: 200 });
      },
    });

    await manager.ensureBucket("athena-local");

    expect(calls).toBe(1);
  });
});
