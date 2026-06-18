import type {
  CommandResult,
  CommandSpec,
  ProcessExecutor,
} from "../process/command.ts";

export interface RuntimeCommandRecord {
  readonly command: CommandSpec;
  readonly result: CommandResult;
}

export interface RuntimeLifecycleResult {
  readonly ok: boolean;
  readonly executed: readonly RuntimeCommandRecord[];
  readonly rollbackExecuted: readonly RuntimeCommandRecord[];
  readonly failedCommand?: CommandSpec;
  readonly message?: string;
}

export async function executeRuntimePlan(
  input: {
    readonly commands: readonly CommandSpec[];
    readonly rollbackCommands?: readonly CommandSpec[];
  },
  executor: ProcessExecutor,
): Promise<RuntimeLifecycleResult> {
  const executed: RuntimeCommandRecord[] = [];

  for (const command of input.commands) {
    const result = await executor.run(command);
    executed.push({ command, result });

    if (result.exitCode !== 0 && command.allowFailure !== true) {
      const rollbackExecuted = await executeRollback(
        input.rollbackCommands ?? [],
        executor,
      );
      return {
        ok: false,
        executed,
        rollbackExecuted,
        failedCommand: command,
        message: compactMessage(result.stderr, result.stdout, "Runtime command failed."),
      };
    }
  }

  return {
    ok: true,
    executed,
    rollbackExecuted: [],
  };
}

async function executeRollback(
  commands: readonly CommandSpec[],
  executor: ProcessExecutor,
): Promise<readonly RuntimeCommandRecord[]> {
  const executed: RuntimeCommandRecord[] = [];
  for (const command of commands) {
    executed.push({
      command,
      result: await executor.run(command),
    });
  }
  return executed;
}

function compactMessage(...values: readonly string[]): string {
  return (
    values.map((value) => value.trim()).find((value) => value.length > 0) ??
    "Runtime command failed."
  );
}
