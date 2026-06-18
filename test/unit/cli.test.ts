import { describe, expect, test } from "bun:test";
import { parseArgs } from "../../src/cli/args.ts";
import { runCli, runCliAsync } from "../../src/cli/run.ts";
import type { HostDoctorChecks } from "../../src/doctor/checks.ts";
import type {
  CommandResult,
  CommandSpec,
  ProcessExecutor,
} from "../../src/process/command.ts";
import type { RuntimeAdapter, RuntimeStatus } from "../../src/runtime/types.ts";

describe("CLI arguments", () => {
  test("parses command options into config overrides", () => {
    const parsed = parseArgs([
      "doctor",
      "--json",
      "--runtime",
      "docker",
      "--storage-backend",
      "s3",
      "--s3-bucket",
      "example-dev",
      "--s3-prefix",
      "athena-local/dev/",
    ]);

    expect(parsed.errors).toEqual([]);
    expect(parsed.command).toBe("doctor");
    expect(parsed.json).toBe(true);
    expect(parsed.config).toEqual({
      containerRuntime: "docker",
      outputMode: "json",
      s3Bucket: "example-dev",
      s3Prefix: "athena-local/dev/",
      storageBackend: "s3",
    });
  });

  test("reports unknown options", () => {
    const parsed = parseArgs(["status", "--wat"]);

    expect(parsed.errors).toEqual(["Unknown option: --wat"]);
  });
});

describe("CLI runner", () => {
  test("renders JSON doctor output with redacted profile", () => {
    const result = runCli(["doctor", "--json"], {
      env: {
        AWS_PROFILE: "dev-admin",
        ATHENA_LOCAL_CONTAINER_RUNTIME: "docker",
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");

    const output = JSON.parse(result.stdout) as {
      ok: boolean;
      command: string;
      config: {
        awsProfile?: string;
        containerRuntime?: string;
      };
      runtimePlan: {
        runtime: string;
        serviceCount: number;
      };
      checks: string[];
    };

    expect(output.ok).toBe(true);
    expect(output.command).toBe("doctor");
    expect(output.config.awsProfile).toBe("[redacted]");
    expect(output.config.containerRuntime).toBe("docker");
    expect(output.runtimePlan).toMatchObject({
      runtime: "docker",
      serviceCount: 4,
    });
    expect(output.checks).toContain("storage-safety");
  });

  test("renders redacted runtime command plans in JSON output", () => {
    const result = runCli(["start", "--json", "--runtime", "docker"]);

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout) as {
      runtimeCommands: {
        command: string;
        commands: Array<{ executable: string; args: string[] }>;
      };
    };

    expect(output.runtimeCommands.command).toBe("start");
    expect(output.runtimeCommands.commands).toHaveLength(16);
    expect(JSON.stringify(output.runtimeCommands.commands)).toContain(
      "MINIO_ROOT_PASSWORD=[redacted]",
    );
    expect(JSON.stringify(output.runtimeCommands.commands)).not.toContain(
      "local-secret",
    );
  });

  test("renders explicit unknown service status before runtime inspection exists", () => {
    const result = runCli(["status", "--json", "--runtime", "docker"]);

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout) as {
      serviceStatus: Array<{
        service: string;
        state: string;
        healthy: boolean;
        message: string;
      }>;
    };

    expect(output.serviceStatus).toEqual([
      {
        service: "postgres",
        state: "unknown",
        healthy: false,
        message: "Runtime service inspection is not wired yet.",
      },
      {
        service: "minio",
        state: "unknown",
        healthy: false,
        message: "Runtime service inspection is not wired yet.",
      },
      {
        service: "hive-metastore",
        state: "unknown",
        healthy: false,
        message: "Runtime service inspection is not wired yet.",
      },
      {
        service: "trino",
        state: "unknown",
        healthy: false,
        message: "Runtime service inspection is not wired yet.",
      },
    ]);
  });

  test("renders inspected service status through async CLI", async () => {
    const runtimeStatus: RuntimeStatus = {
      runtime: "docker",
      available: true,
      services: [
        {
          name: "trino",
          state: "running",
          healthy: true,
        },
      ],
    };
    const result = await runCliAsync(["status", "--json", "--runtime", "docker"], {
      runtimeAdapters: {
        docker: fakeRuntime(runtimeStatus),
      },
    });

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout) as {
      runtimeStatus: RuntimeStatus;
      serviceStatus: RuntimeStatus["services"];
    };

    expect(output.runtimeStatus).toEqual(runtimeStatus);
    expect(output.serviceStatus).toEqual(runtimeStatus.services);
  });

  test("renders inspected service status as text", async () => {
    const result = await runCliAsync(["status", "--runtime", "docker"], {
      runtimeAdapters: {
        docker: fakeRuntime({
          runtime: "docker",
          available: true,
          services: [
            {
              name: "minio",
              state: "running",
              healthy: false,
              message: "health=starting",
            },
          ],
        }),
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Runtime: docker");
    expect(result.stdout).toContain(
      "- minio: running, healthy=false - health=starting",
    );
  });

  test("fails safely for unsafe S3 prefixes", () => {
    const result = runCli([
      "start",
      "--storage-backend",
      "s3",
      "--s3-bucket",
      "example-dev",
      "--s3-prefix",
      "../prod",
    ]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("s3Prefix");
    expect(result.stdout).toBe("");
  });

  test("shows help without requiring a command", () => {
    const result = runCli(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("athena-local <command>");
    expect(result.stderr).toBe("");
  });

  test("gates facade server startup behind explicit facade-only flag", () => {
    const placeholder = runCli(["start"]);
    expect(placeholder.action).toBeUndefined();
    expect(placeholder.stdout).toContain(
      "runtime behavior will be added by the runtime adapter milestone",
    );

    const facadeOnly = runCli(["start", "--facade-only", "--port", "4568"]);
    expect(facadeOnly.action).toEqual({
      type: "serve-facade",
      port: 4568,
    });
    expect(facadeOnly.stdout).toContain("Starting Athena facade on port 4568.");
  });

  test("executes runtime start commands when runtime is selected", async () => {
    const executed: CommandSpec[] = [];
    const result = await runCliAsync(["start", "--runtime", "docker"], {
      processExecutor: recordingExecutor(executed),
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("start: executed 16 docker command(s).\n");
    expect(executed[0]).toEqual({
      executable: "docker",
      args: ["network", "create", "athena-local"],
    });
    expect(executed).toHaveLength(16);
  });

  test("requires explicit runtime before executing runtime commands", async () => {
    const result = await runCliAsync(["start"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Runtime command requires --runtime");
  });

  test("rolls back failed start commands", async () => {
    const executed: CommandSpec[] = [];
    const result = await runCliAsync(["start", "--runtime", "docker"], {
      processExecutor: recordingExecutor(executed, {
        failAt: 2,
        stderr: "port is already allocated",
      }),
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("port is already allocated");
    expect(result.stderr).toContain("rollback commands executed: 8");
    expect(executed).toHaveLength(10);
  });

  test("renders async JSON doctor diagnostics with detected runtimes", async () => {
    const result = await runCliAsync(["doctor", "--json"], {
      runtimeAdapters: {
        "apple-container": fakeRuntime({
          runtime: "apple-container",
          available: false,
          services: [],
          message: "container: command not found",
        }),
        docker: fakeRuntime({
          runtime: "docker",
          available: true,
          version: "27.5.1",
          services: [],
        }),
      },
      hostChecks: fakeHostChecks(),
    });

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout) as {
      diagnostics: {
        selectedRuntime?: string;
        runtimes: Array<{
          runtime: string;
          available: boolean;
          services: unknown[];
          version?: string;
          message?: string;
        }>;
        host: {
          ports: Array<{ name: string; port: number; available: boolean }>;
          writableDirectories: Array<{ path: string; writable: boolean }>;
        };
      };
    };

    expect(output.diagnostics.selectedRuntime).toBe("docker");
    expect(output.diagnostics.runtimes).toEqual([
      {
        runtime: "apple-container",
        available: false,
        services: [],
        message: "container: command not found",
      },
      {
        runtime: "docker",
        available: true,
        version: "27.5.1",
        services: [],
      },
    ]);
    expect(output.diagnostics.host.ports).toContainEqual({
      name: "athena",
      port: 4567,
      available: true,
    });
    expect(output.diagnostics.host.writableDirectories).toContainEqual({
      path: process.cwd(),
      writable: true,
    });
  });

  test("renders async text doctor diagnostics", async () => {
    const result = await runCliAsync(["doctor", "--runtime", "apple-container"], {
      runtimeAdapters: {
        "apple-container": fakeRuntime({
          runtime: "apple-container",
          available: true,
          version: "0.2.1",
          services: [],
        }),
        docker: fakeRuntime({
          runtime: "docker",
          available: true,
          version: "27.5.1",
          services: [],
        }),
      },
      hostChecks: fakeHostChecks({
        unavailablePorts: new Set(["trino"]),
        unwritablePaths: new Set([`${process.cwd()}/.athena-local`]),
      }),
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Selected runtime: apple-container.");
    expect(result.stdout).toContain("- apple-container: available 0.2.1");
    expect(result.stdout).toContain("- docker: available 27.5.1");
    expect(result.stdout).toContain("- trino 8080: conflict - port in use");
    expect(result.stdout).toContain(
      `- ${process.cwd()}/.athena-local: not writable - permission denied`,
    );
  });
});

function recordingExecutor(
  executed: CommandSpec[],
  options: {
    readonly failAt?: number;
    readonly stderr?: string;
  } = {},
): ProcessExecutor {
  let count = 0;
  return {
    run: async (command) => {
      executed.push(command);
      count += 1;
      if (options.failAt === count) {
        return commandResult(1, "", options.stderr ?? "failed");
      }
      return commandResult(0, "ok", "");
    },
  };
}

function commandResult(
  exitCode: number,
  stdout: string,
  stderr: string,
): CommandResult {
  return {
    exitCode,
    stdout,
    stderr,
  };
}

function fakeRuntime(status: RuntimeStatus): RuntimeAdapter {
  return {
    kind: status.runtime,
    detect: async () => status,
    status: async () => status,
    planStart: () => [],
    planStop: () => [],
    planDestroy: () => [],
  };
}

function fakeHostChecks(
  options: {
    readonly unavailablePorts?: ReadonlySet<string>;
    readonly unwritablePaths?: ReadonlySet<string>;
  } = {},
): HostDoctorChecks {
  return {
    checkPort: async (name, port) => {
      if (options.unavailablePorts?.has(name) === true) {
        return {
          name,
          port,
          available: false,
          message: "port in use",
        };
      }
      return {
        name,
        port,
        available: true,
      };
    },
    checkWritableDirectory: async (path) => {
      if (options.unwritablePaths?.has(path) === true) {
        return {
          path,
          writable: false,
          message: "permission denied",
        };
      }
      return {
        path,
        writable: true,
      };
    },
  };
}
