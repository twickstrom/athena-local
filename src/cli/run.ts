import { redactConfig, resolveConfig } from "../config/resolve.ts";
import type { AthenaLocalConfig } from "../config/types.ts";
import type { ConfigSources } from "../config/types.ts";
import {
  collectHostDiagnostics,
  type HostDiagnostics,
  type HostDoctorChecks,
} from "../doctor/checks.ts";
import { createLocalStackServices } from "../infra/services.ts";
import { packageName, projectVersion } from "../index.ts";
import {
  createBunProcessExecutor,
  redactCommand,
  type ProcessExecutor,
} from "../process/command.ts";
import { executeRuntimePlan } from "../runtime/lifecycle.ts";
import {
  createRuntimeCommandPlan,
  createRuntimePlanSummary,
  type RuntimePlanCommand,
} from "../runtime/select.ts";
import { AppleContainerRuntimeAdapter } from "../runtime/apple-container.ts";
import { DockerRuntimeAdapter } from "../runtime/docker.ts";
import type {
  RuntimeAdapter,
  RuntimeKind,
  RuntimeStatus,
} from "../runtime/types.ts";
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
  readonly runtimeAdapters?: Partial<Record<RuntimeKind, RuntimeAdapter>>;
  readonly hostChecks?: HostDoctorChecks;
  readonly processExecutor?: ProcessExecutor;
}

export interface DoctorDiagnostics {
  readonly selectedRuntime?: RuntimeKind;
  readonly runtimes: readonly RuntimeStatus[];
  readonly host: HostDiagnostics;
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
    const runtimePlan =
      resolved.config.containerRuntime === undefined
        ? undefined
        : createRuntimePlanSummary({
            runtime: resolved.config.containerRuntime,
            projectName: resolved.config.projectId,
            networkName: resolved.config.projectId,
          });
    const runtimeCommands =
      resolved.config.containerRuntime === undefined ||
      !isRuntimePlanCommand(parsed.command)
        ? undefined
        : createRuntimeCommandPlan({
            runtime: resolved.config.containerRuntime,
            command: parsed.command,
            projectName: resolved.config.projectId,
            networkName: resolved.config.projectId,
            redact: true,
          });
    const serviceStatus =
      parsed.command !== "status" || runtimePlan === undefined
        ? undefined
        : runtimePlan.services.map((service) => ({
            service,
            state: "unknown",
            healthy: false,
            message: "Runtime service inspection is not wired yet.",
          }));

    return ok(
      `${JSON.stringify(
        {
          ok: true,
          command: parsed.command,
          config: redactConfig(resolved.config),
          ...(runtimePlan === undefined ? {} : { runtimePlan }),
          ...(runtimeCommands === undefined ? {} : { runtimeCommands }),
          ...(serviceStatus === undefined ? {} : { serviceStatus }),
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

export async function runCliAsync(
  args: readonly string[],
  environment: CliEnvironment = {},
): Promise<CliResult> {
  const result = runCli(args, environment);
  const parsed = parseArgs(args);

  if (
    result.exitCode !== 0 ||
    parsed.errors.length > 0 ||
    result.action !== undefined
  ) {
    return result;
  }

  const resolved = resolveConfig({
    ...environment.configSources,
    ...(environment.env === undefined ? {} : { env: environment.env }),
    cli: parsed.config,
  });

  if (resolved.issues.length > 0) {
    return result;
  }

  if (parsed.command === "status" && resolved.config.containerRuntime !== undefined) {
    return inspectRuntimeStatus(result, parsed.json, resolved.config, environment);
  }

  if (
    parsed.command !== undefined &&
    isRuntimePlanCommand(parsed.command) &&
    !parsed.json
  ) {
    return executeRuntimeCommand(parsed.command, resolved.config, environment);
  }

  if (parsed.command !== "doctor") {
    return result;
  }

  const diagnostics = await detectRuntimes(resolved.config, environment);

  if (parsed.json) {
    const output = JSON.parse(result.stdout) as Record<string, unknown>;
    return ok(`${JSON.stringify({ ...output, diagnostics }, null, 2)}\n`);
  }

  return ok(
    [
      renderTextCommand(parsed.command, resolved.config.containerRuntime).trimEnd(),
      renderDoctorDiagnostics(diagnostics),
    ].join("\n"),
  );
}

async function inspectRuntimeStatus(
  result: CliResult,
  json: boolean,
  config: AthenaLocalConfig,
  environment: CliEnvironment,
): Promise<CliResult> {
  const adapter = createRuntimeAdapters(config, environment)[config.containerRuntime!];
  const status = await adapter.status(createLocalStackServices());

  if (json) {
    const output = JSON.parse(result.stdout) as Record<string, unknown>;
    return ok(
      `${JSON.stringify(
        {
          ...output,
          runtimeStatus: status,
          serviceStatus: status.services,
        },
        null,
        2,
      )}\n`,
    );
  }

  return ok(renderRuntimeStatus(status));
}

async function executeRuntimeCommand(
  command: RuntimePlanCommand,
  config: AthenaLocalConfig,
  environment: CliEnvironment,
): Promise<CliResult> {
  if (config.containerRuntime === undefined) {
    return {
      exitCode: 2,
      stdout: "",
      stderr:
        "Runtime command requires --runtime, ATHENA_LOCAL_CONTAINER_RUNTIME, or saved local configuration.\n",
    };
  }

  const plan = createRuntimeCommandPlan({
    runtime: config.containerRuntime,
    command,
    projectName: config.projectId,
    networkName: config.projectId,
  });
  const rollback =
    command === "start" || command === "reset"
      ? createRuntimeCommandPlan({
          runtime: config.containerRuntime,
          command: "destroy",
          projectName: config.projectId,
          networkName: config.projectId,
        }).commands
      : [];
  const lifecycle = await executeRuntimePlan(
    {
      commands: plan.commands,
      rollbackCommands: rollback,
    },
    environment.processExecutor ?? createBunProcessExecutor(),
  );

  if (lifecycle.ok) {
    return ok(
      `${command}: executed ${lifecycle.executed.length} ${config.containerRuntime} command(s).\n`,
    );
  }

  return {
    exitCode: 1,
    stdout: "",
    stderr:
      `${command}: failed after ${lifecycle.executed.length} command(s): ${lifecycle.message ?? "Runtime command failed."}\n` +
      `failed command: ${formatCommand(redactCommand(lifecycle.failedCommand ?? plan.commands[0]!))}\n` +
      `rollback commands executed: ${lifecycle.rollbackExecuted.length}\n`,
  };
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

async function detectRuntimes(
  config: AthenaLocalConfig,
  environment: CliEnvironment,
): Promise<DoctorDiagnostics> {
  const adapters = createRuntimeAdapters(config, environment);
  const [runtimes, host] = await Promise.all([
    Promise.all([
      adapters["apple-container"].detect(),
      adapters.docker.detect(),
    ]),
    collectHostDiagnostics(config, environment.hostChecks),
  ]);
  const selectedRuntime = config.containerRuntime ?? selectDetectedRuntime(runtimes);

  return {
    runtimes,
    host,
    ...(selectedRuntime === undefined ? {} : { selectedRuntime }),
  };
}

function createRuntimeAdapters(
  config: AthenaLocalConfig,
  environment: CliEnvironment,
): Record<RuntimeKind, RuntimeAdapter> {
  return {
    "apple-container":
      environment.runtimeAdapters?.["apple-container"] ??
      new AppleContainerRuntimeAdapter({
        projectName: config.projectId,
        networkName: config.projectId,
      }),
    docker:
      environment.runtimeAdapters?.docker ??
      new DockerRuntimeAdapter({
        projectName: config.projectId,
        networkName: config.projectId,
      }),
  };
}

function selectDetectedRuntime(
  statuses: readonly RuntimeStatus[],
): RuntimeKind | undefined {
  const available = statuses.filter((status) => status.available);
  return available.length === 1 ? available[0]?.runtime : undefined;
}

function renderDoctorDiagnostics(diagnostics: DoctorDiagnostics): string {
  const runtimeLines = diagnostics.runtimes.map((status) => {
    const availability = status.available ? "available" : "unavailable";
    const version = status.version === undefined ? "" : ` ${status.version}`;
    const message = status.message === undefined ? "" : ` - ${status.message}`;
    return `- ${status.runtime}: ${availability}${version}${message}`;
  });

  return [
    `Selected runtime: ${diagnostics.selectedRuntime ?? "not selected"}.`,
    "Detected runtimes:",
    ...runtimeLines,
    "Ports:",
    ...diagnostics.host.ports.map((status) => {
      const message = status.message === undefined ? "" : ` - ${status.message}`;
      return `- ${status.name} ${status.port}: ${status.available ? "available" : "conflict"}${message}`;
    }),
    "Writable directories:",
    ...diagnostics.host.writableDirectories.map((status) => {
      const message = status.message === undefined ? "" : ` - ${status.message}`;
      return `- ${status.path}: ${status.writable ? "writable" : "not writable"}${message}`;
    }),
    "",
  ].join("\n");
}

function renderRuntimeStatus(status: RuntimeStatus): string {
  return [
    `Runtime: ${status.runtime}`,
    ...status.services.map((service) => {
      const message = service.message === undefined ? "" : ` - ${service.message}`;
      return `- ${service.name}: ${service.state}, healthy=${service.healthy}${message}`;
    }),
    "",
  ].join("\n");
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

function formatCommand(command: {
  readonly executable: string;
  readonly args: readonly string[];
}): string {
  return [command.executable, ...command.args].join(" ");
}

function isRuntimePlanCommand(command: string): command is RuntimePlanCommand {
  return (
    command === "start" ||
    command === "stop" ||
    command === "reset" ||
    command === "destroy"
  );
}

export { commands };
