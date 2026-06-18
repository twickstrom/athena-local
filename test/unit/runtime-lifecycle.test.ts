import { describe, expect, test } from "bun:test";
import { createCommandSpec } from "../../src/process/command.ts";
import type {
  CommandResult,
  CommandSpec,
  ProcessExecutor,
} from "../../src/process/command.ts";
import { executeRuntimePlan } from "../../src/runtime/lifecycle.ts";

describe("runtime lifecycle execution", () => {
  test("executes planned commands in order", async () => {
    const commands = [
      createCommandSpec("docker", ["network", "create", "athena-local"]),
      createCommandSpec("docker", ["start", "athena-local-trino"]),
    ];
    const executor = scriptedExecutor([
      ok("network created"),
      ok("container started"),
    ]);

    const result = await executeRuntimePlan({ commands }, executor);

    expect(result.ok).toBe(true);
    expect(result.executed.map((record) => record.command)).toEqual(commands);
    expect(result.rollbackExecuted).toEqual([]);
  });

  test("stops at the first failure and runs rollback commands", async () => {
    const commands = [
      createCommandSpec("docker", ["network", "create", "athena-local"]),
      createCommandSpec("docker", ["start", "athena-local-trino"]),
      createCommandSpec("docker", ["start", "athena-local-minio"]),
    ];
    const rollbackCommands = [
      createCommandSpec("docker", ["stop", "athena-local-trino"]),
    ];
    const executor = scriptedExecutor([
      ok("network created"),
      fail("port is already allocated"),
      ok("rollback complete"),
    ]);

    const result = await executeRuntimePlan(
      {
        commands,
        rollbackCommands,
      },
      executor,
    );

    expect(result).toMatchObject({
      ok: false,
      failedCommand: commands[1],
      message: "port is already allocated",
    });
    expect(result.executed.map((record) => record.command)).toEqual(
      commands.slice(0, 2),
    );
    expect(result.rollbackExecuted.map((record) => record.command)).toEqual(
      rollbackCommands,
    );
  });
});

function scriptedExecutor(results: readonly CommandResult[]): ProcessExecutor {
  const remaining = [...results];
  return {
    run: async (_command: CommandSpec) => {
      const result = remaining.shift();
      if (result === undefined) {
        throw new Error("Unexpected command execution.");
      }
      return result;
    },
  };
}

function ok(stdout: string): CommandResult {
  return {
    exitCode: 0,
    stdout,
    stderr: "",
  };
}

function fail(stderr: string): CommandResult {
  return {
    exitCode: 1,
    stdout: "",
    stderr,
  };
}
