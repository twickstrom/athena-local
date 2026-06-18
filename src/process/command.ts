export interface CommandSpec {
  readonly executable: string;
  readonly args: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly cwd?: string;
}

export interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ProcessExecutor {
  readonly run: (command: CommandSpec) => Promise<CommandResult>;
}

const safeExecutablePattern = /^[a-zA-Z0-9._/-]+$/;

export function createCommandSpec(
  executable: string,
  args: readonly string[] = [],
  options: {
    readonly env?: Readonly<Record<string, string>>;
    readonly cwd?: string;
  } = {},
): CommandSpec {
  validateExecutable(executable);
  for (const arg of args) {
    validateArgument(arg);
  }
  return {
    executable,
    args: [...args],
    ...options,
  };
}

export function redactCommand(command: CommandSpec): CommandSpec {
  const redactedEnv =
    command.env === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(command.env).map(([key, value]) => [
            key,
            isSensitiveKey(key) ? "[redacted]" : value,
          ]),
        );

  return {
    ...command,
    args: command.args.map(redactValue),
    ...(redactedEnv === undefined ? {} : { env: redactedEnv }),
  };
}

export function createBunProcessExecutor(): ProcessExecutor {
  return {
    run: async (command) => {
      const subprocess = Bun.spawn([command.executable, ...command.args], {
        env: {
          ...Bun.env,
          ...(command.env ?? {}),
        },
        stdout: "pipe",
        stderr: "pipe",
        ...(command.cwd === undefined ? {} : { cwd: command.cwd }),
      });

      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(subprocess.stdout).text(),
        new Response(subprocess.stderr).text(),
        subprocess.exited,
      ]);

      return {
        exitCode,
        stdout,
        stderr,
      };
    },
  };
}

function validateExecutable(executable: string): void {
  if (executable.length === 0 || !safeExecutablePattern.test(executable)) {
    throw new Error("Executable must be a non-empty path-like token.");
  }
}

function validateArgument(arg: string): void {
  if (arg.includes("\0")) {
    throw new Error("Command arguments must not contain null bytes.");
  }
}

function redactValue(value: string): string {
  if (value.includes("://") && value.includes("@")) {
    return "[redacted-url]";
  }
  return value;
}

function isSensitiveKey(key: string): boolean {
  return /TOKEN|SECRET|PASSWORD|ACCESS_KEY|AUTHORIZATION/i.test(key);
}
