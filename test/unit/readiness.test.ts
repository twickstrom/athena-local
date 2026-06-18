import { describe, expect, test } from "bun:test";
import type { ReadinessProbes } from "../../src/runtime/readiness.ts";
import { waitForServicesReady } from "../../src/runtime/readiness.ts";
import type { RuntimeServiceDefinition } from "../../src/runtime/types.ts";

describe("runtime readiness", () => {
  test("reports all services ready", async () => {
    const result = await waitForServicesReady(
      [service("trino", { type: "http", url: "http://127.0.0.1", timeoutMs: 10 })],
      probes(true),
      { sleep: async () => {} },
    );

    expect(result).toEqual({
      ready: true,
      services: [{ service: "trino", ready: true }],
    });
  });

  test("reports timed-out services", async () => {
    let now = 0;
    const result = await waitForServicesReady(
      [service("postgres", { type: "tcp", host: "127.0.0.1", port: 5432, timeoutMs: 2 })],
      probes(false),
      {
        now: () => now,
        sleep: async () => {
          now += 3;
        },
      },
    );

    expect(result).toEqual({
      ready: false,
      services: [
        {
          service: "postgres",
          ready: false,
          message: "Readiness check returned not ready.",
        },
      ],
    });
  });
});

function probes(ready: boolean): ReadinessProbes {
  return {
    http: async () => ready,
    tcp: async () => ready,
    command: async () => ready,
  };
}

function service(
  name: string,
  readiness: RuntimeServiceDefinition["readiness"],
): RuntimeServiceDefinition {
  return {
    name,
    image: "example/image:1",
    ports: [],
    volumes: [],
    dependsOn: [],
    readiness,
  };
}
