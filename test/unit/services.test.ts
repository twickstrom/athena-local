import { describe, expect, test } from "bun:test";
import { createLocalStackServices } from "../../src/infra/services.ts";
import { DockerRuntimeAdapter } from "../../src/runtime/docker.ts";
import { validateServiceDefinition } from "../../src/runtime/types.ts";

describe("local stack service definitions", () => {
  test("defines the required local infrastructure services with pinned images", () => {
    const services = createLocalStackServices();

    expect(services.map((service) => service.name)).toEqual([
      "postgres",
      "minio",
      "hive-metastore",
      "trino",
    ]);
    expect(
      services.flatMap((service) => validateServiceDefinition(service)),
    ).toEqual([]);
    expect(services.map((service) => service.image)).not.toContain("latest");
  });

  test("can be translated into Docker command plans", () => {
    const adapter = new DockerRuntimeAdapter({
      projectName: "athena-local",
      networkName: "athena-local",
    });

    const commands = adapter.planStart(createLocalStackServices());

    expect(commands[0]).toEqual({
      executable: "docker",
      args: ["network", "create", "athena-local"],
    });
    expect(commands.some((command) => command.args.includes("trinodb/trino:477"))).toBe(
      true,
    );
    expect(
      commands.some((command) =>
        command.args.includes(
          "quay.io/minio/minio:RELEASE.2025-04-22T22-12-26Z",
        ),
      ),
    ).toBe(true);
  });
});
