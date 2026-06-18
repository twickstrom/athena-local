import { redactConfig, resolveConfig } from "../config/resolve.ts";
import type { ConfigSources } from "../config/types.ts";
import { packageName, projectVersion } from "../index.ts";
import { commands, parseArgs } from "./args.ts";

export interface CliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly action?: CliAction;
}

export type CliAction =
  | {
      readonly type: "serve-facade";
      readonly port: number;
    };

export interface CliEnvironment {
  readonly env?: Record<string, string | undefined>;
  readonly isTty?: boolean;
  readonly configSources?: Omit<ConfigSources, "cli" | "env">;
}

export function runCli(
  args: readonly string[],
  environment: CliEnvironment = {},
): CliResult {
  const parsed = parseArgs(args);

  if (parsed.version) {
    return ok(`${projectVersion}\n`);
  }

  if (parsed.help || parsed.command === undefined) {
    const exitCode = parsed.errors.length > 0 ? 2 : 0;
    return {
      exitCode,
      stdout: helpText(),
      stderr: parsed.errors.join("\n") + (parsed.errors.length > 0 ? "\n" : ""),
    };
  }

  if (parsed.errors.length > 0) {
    return {
      exitCode: 2,
      stdout: "",
      stderr: parsed.errors.join("\n") + "\n",
    };
  }

  const resolved = resolveConfig({
    ...environment.configSources,
    ...(environment.env === undefined ? {} : { env: environment.env }),
    cli: parsed.config,
  });

  if (resolved.issues.length > 0) {
    return {
      exitCode: 2,
      stdout: parsed.json
        ? `${JSON.stringify({ ok: false, issues: resolved.issues }, null, 2)}\n`
        : "",
      stderr: parsed.json
        ? ""
        : resolved.issues
            .map((issue) => `${issue.field}: ${issue.message}`)
            .join("\n") + "\n",
    };
  }

  if (parsed.json) {
    return ok(
      `${JSON.stringify(
        {
          ok: true,
          command: parsed.command,
          config: redactConfig(resolved.config),
          checks: checksFor(parsed.command),
        },
        null,
        2,
      )}\n`,
    );
  }

  if (parsed.command === "start" && parsed.facadeOnly) {
    return {
      exitCode: 0,
      stdout: `Starting Athena facade on port ${parsed.port ?? resolved.config.ports.athena}.\n`,
      stderr: "",
      action: {
        type: "serve-facade",
        port: parsed.port ?? resolved.config.ports.athena,
      },
    };
  }

  return ok(renderTextCommand(parsed.command, resolved.config.containerRuntime));
}

function ok(stdout: string): CliResult {
  return {
    exitCode: 0,
    stdout,
    stderr: "",
  };
}

function helpText(): string {
  return `${packageName}

Usage:
  athena-local <command> [options]
  athena-local --help
  athena-local --version

Commands:
  configure   Create or update local configuration
  doctor      Check runtime, storage, ports, and safety configuration
  start       Start local services
  stop        Stop services without deleting persistent data
  status      Show local service status
  reset       Recreate local project state
  destroy     Remove local services and local data
  seed        Seed deterministic fixture data

Options:
  --json
  --facade-only
  --port <port>
  --runtime apple-container|docker
  --storage-backend minio|s3
  --mode test|persistent
  --project-id <id>
  --run-id <id>
  --s3-bucket <bucket>
  --s3-prefix <prefix>
`;
}

function renderTextCommand(
  command: string,
  runtime: string | undefined,
): string {
  switch (command) {
    case "configure":
      return "Configuration resolved. File writing will be added with interactive setup.\n";
    case "doctor":
      return `Doctor checks are ready for configuration validation. Runtime: ${runtime ?? "auto-detect"}.\n`;
    case "status":
      return "Status command is ready for configuration validation. Runtime adapters are next.\n";
    default:
      return `${command}: configuration validation is available; runtime behavior will be added by the runtime adapter milestone.\n`;
  }
}

function checksFor(command: string): readonly string[] {
  if (command === "doctor") {
    return [
      "configuration",
      "runtime-selection",
      "storage-safety",
      "port-configuration",
    ];
  }
  return ["configuration"];
}

export { commands };
