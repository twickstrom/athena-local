// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import { redactConfig, resolveConfig } from "../config/resolve.ts";
import type { AthenaLocalConfig, ContainerRuntime } from "../config/types.ts";
import type { ConfigSources } from "../config/types.ts";
import {
  collectHostDiagnostics,
  type HostDiagnostics,
  type HostDoctorChecks,
} from "../doctor/checks.ts";
import { createLocalStackServices } from "../infra/services.ts";
import {
  prepareLocalRuntimeConfig,
  type RuntimeConfigOptions,
  type RuntimeConfigPaths,
} from "../infra/runtime-config.ts";
import { packageName, projectVersion } from "../index.ts";
import {
  createBunProcessExecutor,
  createCommandSpec,
  redactCommand,
  type ProcessExecutor,
} from "../process/command.ts";
import { executeRuntimePlan } from "../runtime/lifecycle.ts";
import {
  createDefaultReadinessProbes,
  waitForServicesReady,
  type ReadinessProbes,
  type ReadinessWaitOptions,
} from "../runtime/readiness.ts";
import {
  createDefaultSeedStatements,
  createTrinoSeedExecutor,
  seedLocalCatalog,
  type SeedExecutor,
} from "../seed/seed.ts";
import { SigV4BucketManager, type BucketManager } from "../storage/buckets.ts";
import { TrinoClient } from "../trino/client.ts";
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
  readonly readinessProbes?: ReadinessProbes;
  readonly readinessOptions?: ReadinessWaitOptions;
  readonly runtimeConfigWriter?: (
    options: RuntimeConfigOptions,
  ) => Promise<RuntimeConfigPaths>;
  readonly seedExecutor?: SeedExecutor;
  readonly bucketManager?: BucketManager;
  // Directory holding the persisted running-config snapshot (defaults to the
  // runtime config root). Injected in tests.
  readonly runningConfigRoot?: string;
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
            ports: resolved.config.ports,
            bundledMinio: resolved.config.storageBackend === "minio",
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
            ports: resolved.config.ports,
            bundledMinio: resolved.config.storageBackend === "minio",
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

  if (parsed.command === "seed") {
    return runSeed(resolved.config, environment, parsed.json);
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

async function runSeed(
  config: AthenaLocalConfig,
  environment: CliEnvironment,
  json: boolean,
): Promise<CliResult> {
  const executor =
    environment.seedExecutor ??
    createTrinoSeedExecutor(
      new TrinoClient({
        endpoint: environment.env?.TRINO_ENDPOINT ?? "http://127.0.0.1:8080",
        user: environment.env?.ATHENA_LOCAL_TRINO_USER ?? "athena-local",
        catalog: "hive",
        schema: "default",
      }),
    );
  const bucketManager = environment.bucketManager ?? defaultBucketManager(config, environment);
  if (bucketManager !== undefined) {
    for (const bucket of seedBuckets(config, environment.env ?? {})) {
      await bucketManager.ensureBucket(bucket);
    }
  }
  const result = await seedLocalCatalog(
    executor,
    createDefaultSeedStatements({
      warehouseLocation:
        config.storageBackend === "minio"
          ? "s3a://athena-local/warehouse/default"
          : `s3a://${config.s3Bucket}/${config.s3Prefix ?? "athena-local"}/warehouse/default`,
    }),
  );

  if (json) {
    return ok(`${JSON.stringify({ ok: true, seeded: result.statements }, null, 2)}\n`);
  }

  return ok(`seed: executed ${result.statements.length} statement(s).\n`);
}

function defaultBucketManager(
  config: AthenaLocalConfig,
  environment: CliEnvironment,
): BucketManager | undefined {
  if (config.storageBackend !== "minio") {
    return undefined;
  }
  return new SigV4BucketManager({
    endpoint:
      environment.env?.ATHENA_LOCAL_MINIO_ENDPOINT ??
      environment.env?.S3_ENDPOINT ??
      "http://127.0.0.1:9000",
    region: config.awsRegion,
    accessKeyId: environment.env?.AWS_ACCESS_KEY_ID ?? "local",
    secretAccessKey: environment.env?.AWS_SECRET_ACCESS_KEY ?? "local-secret",
  });
}

function isMinioPortName(name: string): boolean {
  return name === "minio" || name === "minioConsole";
}

const DEFAULT_RUNTIME_ROOT = ".athena-local/runtime";
const RUNNING_CONFIG_FILE = "running.json";

function runningConfigPath(root: string): string {
  return `${root.replace(/\/+$/, "")}/${RUNNING_CONFIG_FILE}`;
}

// Persist the effective config of a started stack so a later `status` (run
// without the same env) can report what is actually running. Best-effort: a
// start must never fail because the snapshot could not be written.
async function writeRunningConfig(
  root: string,
  config: AthenaLocalConfig,
): Promise<void> {
  try {
    await Bun.write(
      runningConfigPath(root),
      `${JSON.stringify(
        { config: redactConfig(config), savedAt: new Date().toISOString() },
        null,
        2,
      )}\n`,
    );
  } catch {
    // ignore — the snapshot is a diagnostic convenience, not load-bearing
  }
}

async function readRunningConfig(
  root: string,
): Promise<{ readonly config: unknown; readonly savedAt?: string } | undefined> {
  try {
    const file = Bun.file(runningConfigPath(root));
    if (!(await file.exists())) {
      return undefined;
    }
    return JSON.parse(await file.text()) as {
      readonly config: unknown;
      readonly savedAt?: string;
    };
  } catch {
    return undefined;
  }
}

async function removeRunningConfig(root: string): Promise<void> {
  try {
    const { rm } = await import("node:fs/promises");
    await rm(runningConfigPath(root), { force: true });
  } catch {
    // ignore
  }
}

function seedBuckets(
  config: AthenaLocalConfig,
  env: Record<string, string | undefined>,
): readonly string[] {
  const buckets = new Set<string>();
  if (config.storageBackend === "minio") {
    buckets.add("athena-local");
  }
  buckets.add(parseBucket(env.ATHENA_OUTPUT_LOCATION ?? "s3://athena-local-results/local/"));
  if (config.s3Bucket !== undefined) {
    buckets.add(config.s3Bucket);
  }
  return [...buckets];
}

function parseBucket(location: string): string {
  const withoutScheme = location.startsWith("s3://")
    ? location.slice("s3://".length)
    : location;
  const bucket = withoutScheme.split("/")[0];
  if (bucket === undefined || bucket.length === 0) {
    throw new Error("S3 location must include a bucket.");
  }
  return bucket;
}

async function inspectRuntimeStatus(
  result: CliResult,
  json: boolean,
  config: AthenaLocalConfig,
  environment: CliEnvironment,
): Promise<CliResult> {
  const adapter = createRuntimeAdapters(config, environment)[config.containerRuntime!];
  const status = await adapter.status(
    createLocalStackServices({
      ports: config.ports,
      bundledMinio: config.storageBackend === "minio",
    }),
  );

  // Prefer the snapshot written at start so status reflects the config the
  // running stack was started with, not whatever env happens to be set now.
  const running = await readRunningConfig(
    environment.runningConfigRoot ?? DEFAULT_RUNTIME_ROOT,
  );

  if (json) {
    const output = JSON.parse(result.stdout) as Record<string, unknown>;
    return ok(
      `${JSON.stringify(
        {
          ...output,
          ...(running === undefined
            ? { configSource: "resolved" }
            : {
                config: running.config,
                configSource: "running",
                ...(running.savedAt === undefined
                  ? {}
                  : { runningSince: running.savedAt }),
              }),
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

  if (command === "start" || command === "reset") {
    const diagnostics = await collectHostDiagnostics(config, environment.hostChecks);
    // The s3/external backends do not run the bundled MinIO, so its ports are
    // not required — and in external mode the store the user attaches to often
    // already occupies 9000. Don't fail the start on ports we won't bind.
    const bundlesMinio = config.storageBackend === "minio";
    const conflicts = diagnostics.ports.filter(
      (port) => !port.available && (bundlesMinio || !isMinioPortName(port.name)),
    );
    if (conflicts.length > 0) {
      return {
        exitCode: 1,
        stdout: "",
        stderr:
          "Cannot start runtime because required host ports are unavailable:\n" +
          conflicts
            .map((port) => `- ${port.name} ${port.port}: ${port.message ?? "unavailable"}`)
            .join("\n") +
          "\n",
      };
    }
  }

  const configWriter =
    environment.runtimeConfigWriter ?? prepareLocalRuntimeConfig;
  let configPaths: RuntimeConfigPaths | undefined;
  if (command === "start" || command === "reset") {
    const adapter =
      createRuntimeAdapters(config, environment)[config.containerRuntime];
    const hostGateway = await adapter.resolveHostGateway();
    configPaths = await configWriter(
      interServiceConfigOptions(config, hostGateway, environment.env ?? {}),
    );
  }

  const bundledMinio = config.storageBackend === "minio";
  const plan = createRuntimeCommandPlan({
    runtime: config.containerRuntime,
    command,
    projectName: config.projectId,
    networkName: config.projectId,
    ports: config.ports,
    bundledMinio,
    ...(configPaths === undefined ? {} : { configPaths }),
  });
  const rollback =
    command === "start" || command === "reset"
      ? createRuntimeCommandPlan({
          runtime: config.containerRuntime,
          command: "destroy",
          projectName: config.projectId,
          networkName: config.projectId,
          ports: config.ports,
          bundledMinio,
          ...(configPaths === undefined ? {} : { configPaths }),
        }).commands
      : [];
  const executor = environment.processExecutor ?? createBunProcessExecutor();
  const lifecycle = await executeRuntimePlan(
    {
      commands: plan.commands,
      rollbackCommands: rollback,
    },
    executor,
  );

  if (lifecycle.ok) {
    if (command === "start" || command === "reset") {
      const readiness = await waitForServicesReady(
        createLocalStackServices({
          ...(configPaths === undefined ? {} : { configPaths }),
          ports: config.ports,
          bundledMinio,
        }),
        environment.readinessProbes ?? createDefaultReadinessProbes(executor),
        environment.readinessOptions,
      );
      if (!readiness.ready) {
        const failedServices = readiness.services.filter(
          (service) => !service.ready,
        );
        // Capture each failed service's container log tail BEFORE rollback
        // removes the containers — that tail is what turns a "not ready"
        // timeout into an actionable diagnosis (e.g. a Trino config error).
        const logTails = await Promise.all(
          failedServices.map((service) =>
            collectServiceLogTail(
              executor,
              config.containerRuntime!,
              config.projectId,
              service.service,
            ),
          ),
        );
        const rollbackLifecycle = await executeRuntimePlan(
          {
            commands: rollback,
          },
          executor,
        );
        const logSection = logTails.filter((tail) => tail.length > 0).join("\n\n");
        return {
          exitCode: 1,
          stdout: "",
          stderr:
            `${command}: runtime started but readiness failed.\n` +
            failedServices
              .map(
                (service) =>
                  `- ${service.service}: ${service.message ?? "not ready"}`,
              )
              .join("\n") +
            (logSection.length > 0 ? `\n\n${logSection}` : "") +
            `\nrollback commands executed: ${rollbackLifecycle.executed.length}\n`,
        };
      }
    }
    // Persist (or clear) the effective running config so a later `status` can
    // report what is actually running, not just the ambient env defaults.
    if (command === "start" || command === "reset") {
      await writeRunningConfig(
        environment.runningConfigRoot ?? configPaths?.root ?? DEFAULT_RUNTIME_ROOT,
        config,
      );
    } else if (command === "destroy" || command === "stop") {
      await removeRunningConfig(
        environment.runningConfigRoot ?? DEFAULT_RUNTIME_ROOT,
      );
    }
    if (command === "start") {
      return {
        exitCode: 0,
        stdout:
          `${command}: executed ${lifecycle.executed.length} ${config.containerRuntime} command(s).\n` +
          `Starting Athena facade on port ${config.ports.athena}.\n`,
        stderr: "",
        action: {
          type: "serve-facade",
          port: config.ports.athena,
        },
      };
    }
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

// Inter-service addresses as the containers see them. Postgres/Hive addressing
// is storage-independent: Docker resolves siblings by --network-alias name;
// Apple container has no such DNS, so it routes through the discovered host
// gateway. The object-store endpoint is storage-dependent: bundled MinIO (gateway
// or service name) vs an external store on the host (its endpoint, with a
// localhost host rewritten to the container-reachable gateway).
export function interServiceConfigOptions(
  config: AthenaLocalConfig,
  hostGateway: string,
  env: Record<string, string | undefined>,
): RuntimeConfigOptions {
  const base: RuntimeConfigOptions =
    config.containerRuntime === "apple-container"
      ? {
          postgresHost: hostGateway,
          postgresPort: config.ports.postgres,
          hiveMetastoreUri: `thrift://${hostGateway}:${config.ports.hiveMetastore}`,
        }
      : {};

  if (config.storageBackend === "external" && config.s3Endpoint !== undefined) {
    const rewrite = rewriteHostEndpoint(config.s3Endpoint, hostGateway);
    if (rewrite.rewritten) {
      console.error(
        `athena-local: external S3 endpoint rewritten for the Trino container: ${config.s3Endpoint} -> ${rewrite.endpoint}`,
      );
    }
    const accessKey = env.ATHENA_LOCAL_S3_ACCESS_KEY ?? env.AWS_ACCESS_KEY_ID;
    const secretKey = env.ATHENA_LOCAL_S3_SECRET_KEY ?? env.AWS_SECRET_ACCESS_KEY;
    return {
      ...base,
      minioEndpoint: rewrite.endpoint,
      ...(accessKey === undefined ? {} : { minioAccessKey: accessKey }),
      ...(secretKey === undefined ? {} : { minioSecretKey: secretKey }),
    };
  }

  if (config.containerRuntime === "apple-container") {
    return {
      ...base,
      minioEndpoint: `http://${hostGateway}:${config.ports.minio}`,
    };
  }
  return base;
}

// Replace only a localhost / 127.0.0.1 host with the container-reachable host
// gateway, so an external store on the host is reachable from inside Trino. Any
// other hostname (a real S3 endpoint, a named service) passes through untouched.
export function rewriteHostEndpoint(
  endpoint: string,
  gateway: string,
): { readonly endpoint: string; readonly rewritten: boolean } {
  const match = endpoint.match(
    /^(https?:\/\/)(localhost|127\.0\.0\.1)(?=[:/]|$)/i,
  );
  if (match === null) {
    return { endpoint, rewritten: false };
  }
  return {
    endpoint: endpoint.replace(match[0], `${match[1]}${gateway}`),
    rewritten: true,
  };
}

// Fetch the last lines of a service's container log so a readiness failure can
// show *why* (e.g. a bad Trino config), not just that it timed out.
async function collectServiceLogTail(
  executor: ProcessExecutor,
  runtime: ContainerRuntime,
  projectId: string,
  serviceName: string,
  lines = 20,
): Promise<string> {
  const executable = runtime === "docker" ? "docker" : "container";
  const containerName = `${projectId}-${serviceName}`;
  const result = await executor.run(
    createCommandSpec(executable, ["logs", containerName], {
      allowFailure: true,
    }),
  );
  const tail = `${result.stdout}\n${result.stderr}`
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .slice(-lines)
    .join("\n");
  return tail.length === 0
    ? ""
    : `--- ${serviceName} logs (last ${lines} lines) ---\n${tail}`;
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
