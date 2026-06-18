import { describe, expect, test } from "bun:test";
import { createAthenaLocalHandler } from "../../src/server/bootstrap.ts";

describe("server bootstrap", () => {
  test("validates unsafe AWS S3 configuration before creating handler", () => {
    expect(() =>
      createAthenaLocalHandler({
        env: {
          ATHENA_LOCAL_STORAGE_BACKEND: "s3",
          ATHENA_LOCAL_S3_BUCKET: "athena-local-dev",
          ATHENA_LOCAL_S3_PREFIX: "/",
        },
      }),
    ).toThrow("s3Prefix: AWS S3 prefix must not target a bucket root or parent path.");
  });

  test("creates a health-capable handler from local defaults", async () => {
    const bootstrap = createAthenaLocalHandler({
      env: {
        ATHENA_LOCAL_STORAGE_BACKEND: "minio",
        ATHENA_OUTPUT_LOCATION: "s3://athena-local-results/local/",
      },
    });

    const response = await bootstrap.handler(new Request("http://localhost/health"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      service: "athena-local",
    });

    bootstrap.close();
  });
});
