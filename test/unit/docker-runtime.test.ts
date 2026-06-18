import { describe, expect, test } from "bun:test";
import {
  DockerRuntimeAdapter,
  parseDockerVersion,
} from "../../src/runtime/docker.ts";
import type { CommandSpec, ProcessExecutor } from "../../src/process/command.ts";
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
          "--network-alias",
          "trino",
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
        allowFailure: true,
      },
    ]);

    expect(adapter.planDestroy([service])).toEqual([
      {
        executable: "docker",
        args: ["rm", "-f", "athena-local-trino"],
        allowFailure: true,
      },
      {
        executable: "docker",
        args: ["volume", "rm", "athena-local-trino-data"],
        allowFailure: true,
      },
      {
        executable: "docker",
        args: ["network", "rm", "athena-local"],
        allowFailure: true,
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

  test("detects Docker availability and version through the executor", async () => {
    const commands: CommandSpec[] = [];
    const adapter = new DockerRuntimeAdapter({
      projectName: "athena-local",
      networkName: "athena-local",
      executor: fakeExecutor(commands, {
        exitCode: 0,
        stdout: "27.5.1\n",
        stderr: "",
      }),
    });

    await expect(adapter.detect()).resolves.toEqual({
      runtime: "docker",
      available: true,
      version: "27.5.1",
      services: [],
    });
    expect(commands).toEqual([
      {
        executable: "docker",
        args: ["version", "--format", "{{.Server.Version}}"],
      },
    ]);
  });

  test("reports Docker detection failures without throwing", async () => {
    const adapter = new DockerRuntimeAdapter({
      projectName: "athena-local",
      networkName: "athena-local",
      executor: fakeExecutor([], {
        exitCode: 1,
        stdout: "",
        stderr: "Cannot connect to the Docker daemon\n",
      }),
    });

    await expect(adapter.detect()).resolves.toEqual({
      runtime: "docker",
      available: false,
      services: [],
      message: "Cannot connect to the Docker daemon",
    });
  });

  test("inspects Docker service status", async () => {
    const commands: CommandSpec[] = [];
    const adapter = new DockerRuntimeAdapter({
      projectName: "athena-local",
      networkName: "athena-local",
      executor: sequenceExecutor(commands, [
        {
          exitCode: 0,
          stdout: JSON.stringify({
            Status: "running",
            Health: { Status: "healthy" },
          }),
          stderr: "",
        },
        {
          exitCode: 1,
          stdout: "",
          stderr: "No such object",
        },
      ]),
    });

    await expect(adapter.status([service, { ...service, name: "minio" }])).resolves.toEqual({
      runtime: "docker",
      available: true,
      services: [
        {
          name: "trino",
          state: "running",
          healthy: true,
          message: "health=healthy",
        },
        {
          name: "minio",
          state: "missing",
          healthy: false,
          message: "No such object",
        },
      ],
    });
    expect(commands.map((command) => command.args)).toEqual([
      ["inspect", "--format", "{{json .State}}", "athena-local-trino"],
      ["inspect", "--format", "{{json .State}}", "athena-local-minio"],
    ]);
  });

  test("parses Docker versions from command output", () => {
    expect(parseDockerVersion("27.5.1\n")).toBe("27.5.1");
    expect(parseDockerVersion("Docker version 27.5.1, build abc123")).toBe(
      "27.5.1",
    );
    expect(parseDockerVersion("")).toBeUndefined();
  });
});

function fakeExecutor(
  commands: CommandSpec[],
  result: { readonly exitCode: number; readonly stdout: string; readonly stderr: string },
): ProcessExecutor {
  return {
    run: async (command) => {
      commands.push(command);
      return result;
    },
  };
}

function sequenceExecutor(
  commands: CommandSpec[],
  results: Array<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }>,
): ProcessExecutor {
  const remaining = [...results];
  return {
    run: async (command) => {
      commands.push(command);
      const result = remaining.shift();
      if (result === undefined) {
        throw new Error("Unexpected command.");
      }
      return result;
    },
  };
}
