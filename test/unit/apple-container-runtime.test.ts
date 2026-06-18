import { describe, expect, test } from "bun:test";
import {
  AppleContainerRuntimeAdapter,
  parseAppleContainerVersion,
} from "../../src/runtime/apple-container.ts";
import type { CommandSpec, ProcessExecutor } from "../../src/process/command.ts";
import type { RuntimeServiceDefinition } from "../../src/runtime/types.ts";

const service: RuntimeServiceDefinition = {
  name: "minio",
  image: "quay.io/minio/minio:RELEASE.2025-04-22T22-12-26Z",
  command: ["server", "/data"],
  env: {
    MINIO_ROOT_USER: "local",
    MINIO_ROOT_PASSWORD: "local-secret",
  },
  ports: [
    {
      name: "api",
      hostPort: 9000,
      containerPort: 9000,
      protocol: "tcp",
    },
  ],
  volumes: [
    {
      name: "minio-data",
      target: "/data",
    },
  ],
  dependsOn: [],
  readiness: {
    type: "http",
    url: "http://127.0.0.1:9000/minio/health/ready",
    timeoutMs: 30_000,
  },
};

describe("Apple container runtime adapter command generation", () => {
  test("plans start commands from typed service definitions", () => {
    const adapter = new AppleContainerRuntimeAdapter({
      projectName: "athena-local",
      networkName: "athena-local",
    });

    expect(adapter.planStart([service])).toEqual([
      {
        executable: "container",
        args: ["network", "create", "athena-local"],
      },
      {
        executable: "container",
        args: [
          "image",
          "pull",
          "quay.io/minio/minio:RELEASE.2025-04-22T22-12-26Z",
        ],
      },
      {
        executable: "container",
        args: ["volume", "create", "athena-local-minio-data"],
      },
      {
        executable: "container",
        args: [
          "create",
          "--name",
          "athena-local-minio",
          "--network",
          "athena-local",
          "--label",
          "athena-local.project=athena-local",
          "--publish",
          "9000:9000/tcp",
          "--env",
          "MINIO_ROOT_USER=local",
          "--env",
          "MINIO_ROOT_PASSWORD=local-secret",
          "--volume",
          "athena-local-minio-data:/data",
          "quay.io/minio/minio:RELEASE.2025-04-22T22-12-26Z",
          "server",
          "/data",
        ],
      },
      {
        executable: "container",
        args: ["start", "athena-local-minio"],
      },
    ]);
  });

  test("plans stop and destroy commands", () => {
    const adapter = new AppleContainerRuntimeAdapter({
      projectName: "athena-local",
      networkName: "athena-local",
    });

    expect(adapter.planStop([service])).toEqual([
      {
        executable: "container",
        args: ["stop", "athena-local-minio"],
        allowFailure: true,
      },
    ]);

    expect(adapter.planDestroy([service])).toEqual([
      {
        executable: "container",
        args: ["rm", "--force", "athena-local-minio"],
        allowFailure: true,
      },
      {
        executable: "container",
        args: ["volume", "rm", "athena-local-minio-data"],
        allowFailure: true,
      },
      {
        executable: "container",
        args: ["network", "rm", "athena-local"],
        allowFailure: true,
      },
    ]);
  });

  test("rejects invalid service definitions", () => {
    const adapter = new AppleContainerRuntimeAdapter({
      projectName: "athena-local",
      networkName: "athena-local",
    });

    expect(() =>
      adapter.planStart([
        {
          ...service,
          name: "bad service",
        },
      ]),
    ).toThrow("Service name must be a safe identifier.");
  });

  test("detects Apple container availability and version through the executor", async () => {
    const commands: CommandSpec[] = [];
    const adapter = new AppleContainerRuntimeAdapter({
      projectName: "athena-local",
      networkName: "athena-local",
      executor: fakeExecutor(commands, {
        exitCode: 0,
        stdout: "container version 0.2.1\n",
        stderr: "",
      }),
    });

    await expect(adapter.detect()).resolves.toEqual({
      runtime: "apple-container",
      available: true,
      version: "0.2.1",
      services: [],
    });
    expect(commands).toEqual([
      {
        executable: "container",
        args: ["--version"],
      },
    ]);
  });

  test("reports Apple container detection failures without throwing", async () => {
    const adapter = new AppleContainerRuntimeAdapter({
      projectName: "athena-local",
      networkName: "athena-local",
      executor: fakeExecutor([], {
        exitCode: 127,
        stdout: "",
        stderr: "container: command not found\n",
      }),
    });

    await expect(adapter.detect()).resolves.toEqual({
      runtime: "apple-container",
      available: false,
      services: [],
      message: "container: command not found",
    });
  });

  test("inspects Apple container service status", async () => {
    const commands: CommandSpec[] = [];
    const adapter = new AppleContainerRuntimeAdapter({
      projectName: "athena-local",
      networkName: "athena-local",
      executor: sequenceExecutor(commands, [
        {
          exitCode: 0,
          stdout: JSON.stringify({ Status: "created" }),
          stderr: "",
        },
        {
          exitCode: 0,
          stdout: "{not-json",
          stderr: "",
        },
      ]),
    });

    await expect(
      adapter.status([service, { ...service, name: "trino" }]),
    ).resolves.toEqual({
      runtime: "apple-container",
      available: true,
      services: [
        {
          name: "minio",
          state: "created",
          healthy: false,
        },
        {
          name: "trino",
          state: "failed",
          healthy: false,
          message: "Container inspect output was not valid JSON.",
        },
      ],
    });
    expect(commands.map((command) => command.args)).toEqual([
      ["inspect", "athena-local-minio"],
      ["inspect", "athena-local-trino"],
    ]);
  });

  test("parses Apple container versions from command output", () => {
    expect(parseAppleContainerVersion("0.2.1\n")).toBe("0.2.1");
    expect(parseAppleContainerVersion("container version 0.2.1")).toBe("0.2.1");
    expect(parseAppleContainerVersion("")).toBeUndefined();
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
