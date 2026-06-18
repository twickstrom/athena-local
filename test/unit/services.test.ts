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

  test("uses configured host ports for services and readiness", () => {
    const services = createLocalStackServices({
      ports: {
        athena: 14567,
        minio: 19000,
        minioConsole: 19001,
        trino: 18080,
        hiveMetastore: 19083,
        postgres: 15432,
      },
    });

    expect(
      services.flatMap((service) =>
        service.ports.map((port) => [service.name, port.name, port.hostPort]),
      ),
    ).toContainEqual(["postgres", "postgres", 15432]);
    expect(
      services.find((service) => service.name === "trino")?.readiness,
    ).toEqual({
      type: "http",
      url: "http://127.0.0.1:18080/v1/info",
      timeoutMs: 60_000,
    });
  });

  test("configures Postgres and Hive Metastore for persistent startup", () => {
    const services = createLocalStackServices();
    const postgres = services.find((service) => service.name === "postgres");
    const hive = services.find((service) => service.name === "hive-metastore");

    expect(postgres?.env?.PGDATA).toBe("/var/lib/postgresql/data/pgdata");
    expect(hive?.env?.HIVE_AUX_JARS_PATH).toBe(
      "/opt/hive/auxlib/postgresql.jar",
    );
    expect(hive?.volumes).toContainEqual({
      name: "hive-auxlib",
      target: "/opt/hive/auxlib",
      readonly: true,
    });
    expect(hive?.initTasks).toEqual([
      {
        image: "trinodb/trino:477",
        command: [
          "cp",
          "/usr/lib/trino/plugin/postgresql/org.postgresql_postgresql-42.7.8.jar",
          "/hive-auxlib/postgresql.jar",
        ],
        volumes: [
          {
            name: "hive-auxlib",
            target: "/hive-auxlib",
          },
        ],
      },
    ]);
  });
});
