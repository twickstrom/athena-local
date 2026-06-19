// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import { describe, expect, test } from "bun:test";
import { isAbsolute } from "node:path";
import { createLocalStackServices, localServiceImages } from "../../src/infra/services.ts";
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
    expect(
      commands.some((command) => command.args.includes(localServiceImages.trino)),
    ).toBe(true);
    expect(
      commands.some((command) => command.args.includes(localServiceImages.minio)),
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
      expectBodyIncludes: '"starting":false',
      timeoutMs: 180_000,
    });
  });

  test("configures Postgres and Hive Metastore for persistent startup", () => {
    const services = createLocalStackServices();
    const postgres = services.find((service) => service.name === "postgres");
    const hive = services.find((service) => service.name === "hive-metastore");

    expect(postgres?.env?.PGDATA).toBe("/var/lib/postgresql/data/pgdata");
    expect(hive?.env?.HIVE_AUX_JARS_PATH).toBe(
      "/opt/hive/auxlib/postgresql.jar:/opt/hadoop/share/hadoop/tools/lib/hadoop-aws-3.3.6.jar:/opt/hadoop/share/hadoop/tools/lib/aws-java-sdk-bundle-1.12.367.jar",
    );
    expect(hive?.volumes).toContainEqual({
      name: "hive-auxlib",
      target: "/opt/hive/auxlib",
      readonly: true,
    });
    expect(hive?.initTasks).toEqual([
      {
        image: localServiceImages.trino,
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

  test("uses absolute bind sources for config mounts", () => {
    // Docker Engine (Linux) rejects a relative bind source as an invalid volume
    // name. The default config paths are relative, so the service definitions
    // must resolve them to absolute paths.
    const services = createLocalStackServices();
    const bindSources = services
      .flatMap((service) => service.volumes)
      .map((volume) => volume.source)
      .filter((source) => source?.type === "bind");

    expect(bindSources.length).toBeGreaterThan(0);
    for (const source of bindSources) {
      expect(isAbsolute(source!.path)).toBe(true);
    }
  });
});
