import { describe, expect, test } from "bun:test";
import { BunS3Storage } from "../../src/storage/bun-s3.ts";

/**
 * Opt-in AWS S3 contract test. This is intentionally not part of the default
 * suite: it talks to a real bucket and must only run against an isolated
 * development prefix with explicit credentials. Enable it with:
 *
 *   ATHENA_LOCAL_AWS_TEST=1 \
 *   ATHENA_LOCAL_S3_BUCKET=my-dev-bucket \
 *   ATHENA_LOCAL_S3_PREFIX=athena-local/contract/ \
 *   AWS_REGION=us-east-1 \
 *   bun run test:aws
 */
const enabled =
  process.env.ATHENA_LOCAL_AWS_TEST === "1" &&
  typeof process.env.ATHENA_LOCAL_S3_BUCKET === "string" &&
  typeof process.env.ATHENA_LOCAL_S3_PREFIX === "string";

describe("AWS S3 storage contract", () => {
  test.skipIf(!enabled)(
    "writes, reads, checks, and deletes within a scoped prefix",
    async () => {
      const bucket = process.env.ATHENA_LOCAL_S3_BUCKET!;
      const prefix = process.env.ATHENA_LOCAL_S3_PREFIX!.replace(/\/$/, "");
      const key = `${prefix}/round-trip-${crypto.randomUUID()}.csv`;

      const storage = new BunS3Storage({
        kind: "s3",
        bucket,
        ...(process.env.AWS_REGION === undefined
          ? {}
          : { region: process.env.AWS_REGION }),
      });

      const body = "id,label\n1,one\n";
      await storage.write({
        location: { bucket, key },
        contentType: "text/csv",
        body,
      });

      expect(await storage.exists({ bucket, key })).toBe(true);
      expect(new TextDecoder().decode(await storage.read({ bucket, key }))).toBe(
        body,
      );

      await storage.deletePrefix({
        bucket,
        prefix: `${prefix}/`,
        force: true,
        remote: true,
      });
      expect(await storage.exists({ bucket, key })).toBe(false);
    },
  );

  test.skipIf(enabled)("is skipped unless explicitly enabled", () => {
    expect(enabled).toBe(false);
  });
});
