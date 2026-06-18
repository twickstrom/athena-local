import { describe, expect, test } from "bun:test";
import { AppleContainerRuntimeAdapter } from "../../src/runtime/apple-container.ts";
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
      },
    ]);

    expect(adapter.planDestroy([service])).toEqual([
      {
        executable: "container",
        args: ["rm", "athena-local-minio"],
      },
      {
        executable: "container",
        args: ["volume", "rm", "athena-local-minio-data"],
      },
      {
        executable: "container",
        args: ["network", "rm", "athena-local"],
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
});
