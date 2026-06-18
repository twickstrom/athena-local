import { describe, expect, test } from "bun:test";
import { DockerRuntimeAdapter } from "../../src/runtime/docker.ts";
import type { RuntimeServiceDefinition } from "../../src/runtime/types.ts";

const service: RuntimeServiceDefinition = {
  name: "trino",
  image: "trinodb/trino:477",
  command: ["--debug"],
  env: {
    TRINO_ENVIRONMENT: "local",
  },
  ports: [
    {
      name: "http",
      hostPort: 8080,
      containerPort: 8080,
      protocol: "tcp",
    },
  ],
  volumes: [
    {
      name: "trino-data",
      target: "/data",
    },
  ],
  dependsOn: [],
  readiness: {
    type: "http",
    url: "http://127.0.0.1:8080/v1/info",
    timeoutMs: 30_000,
  },
};

describe("Docker runtime adapter command generation", () => {
  test("plans start commands from typed service definitions", () => {
    const adapter = new DockerRuntimeAdapter({
      projectName: "athena-local",
      networkName: "athena-local",
    });

    expect(adapter.planStart([service])).toEqual([
      {
        executable: "docker",
        args: ["network", "create", "athena-local"],
      },
      {
        executable: "docker",
        args: ["pull", "trinodb/trino:477"],
      },
      {
        executable: "docker",
        args: ["volume", "create", "athena-local-trino-data"],
      },
      {
        executable: "docker",
        args: [
          "create",
          "--name",
          "athena-local-trino",
          "--network",
          "athena-local",
          "--label",
          "athena-local.project=athena-local",
          "--publish",
          "8080:8080/tcp",
          "--env",
          "TRINO_ENVIRONMENT=local",
          "--volume",
          "athena-local-trino-data:/data",
          "trinodb/trino:477",
          "--debug",
        ],
      },
      {
        executable: "docker",
        args: ["start", "athena-local-trino"],
      },
    ]);
  });

  test("plans stop and destroy commands", () => {
    const adapter = new DockerRuntimeAdapter({
      projectName: "athena-local",
      networkName: "athena-local",
    });

    expect(adapter.planStop([service])).toEqual([
      {
        executable: "docker",
        args: ["stop", "athena-local-trino"],
      },
    ]);

    expect(adapter.planDestroy([service])).toEqual([
      {
        executable: "docker",
        args: ["rm", "-f", "athena-local-trino"],
      },
      {
        executable: "docker",
        args: ["volume", "rm", "athena-local-trino"],
      },
      {
        executable: "docker",
        args: ["network", "rm", "athena-local"],
      },
    ]);
  });

  test("rejects invalid service definitions", () => {
    const adapter = new DockerRuntimeAdapter({
      projectName: "athena-local",
      networkName: "athena-local",
    });

    expect(() =>
      adapter.planStart([
        {
          ...service,
          image: "trinodb/trino:latest",
        },
      ]),
    ).toThrow("Service image must be pinned and must not use latest.");
  });
});
