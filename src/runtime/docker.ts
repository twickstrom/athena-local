import {
  createBunProcessExecutor,
  createCommandSpec,
  type CommandSpec,
  type ProcessExecutor,
} from "../process/command.ts";
import {
  type RuntimeAdapter,
  type RuntimeServiceDefinition,
  type RuntimeStatus,
  validateServiceDefinition,
} from "./types.ts";
import { missingServiceStatus, parseContainerState } from "./status.ts";

export interface DockerAdapterOptions {
  readonly projectName: string;
  readonly networkName: string;
  readonly executor?: ProcessExecutor;
}

export class DockerRuntimeAdapter implements RuntimeAdapter {
  readonly kind = "docker";
  readonly #projectName: string;
  readonly #networkName: string;
  readonly #executor: ProcessExecutor;

  constructor(options: DockerAdapterOptions) {
    this.#projectName = options.projectName;
    this.#networkName = options.networkName;
    this.#executor = options.executor ?? createBunProcessExecutor();
  }

  async detect(): Promise<RuntimeStatus> {
    const result = await this.#executor.run(
      docker("version", "--format", "{{.Server.Version}}"),
    );

    if (result.exitCode !== 0) {
      return {
        runtime: "docker",
        available: false,
        services: [],
        message: compactMessage(result.stderr, result.stdout, "Docker is not available."),
      };
    }

    const version = parseDockerVersion(result.stdout);

    return {
      runtime: "docker",
      available: true,
      services: [],
      ...(version === undefined ? {} : { version }),
    };
  }

  planStart(services: readonly RuntimeServiceDefinition[]): readonly CommandSpec[] {
    this.#validateServices(services);
    return [
      docker("network", "create", this.#networkName),
      ...services.flatMap((service) => [
        docker("pull", service.image),
        ...(service.initTasks ?? []).map((task) => docker("pull", task.image)),
        ...service.volumes
          .filter((volume) => volume.source?.type !== "bind")
          .map((volume) => docker("volume", "create", this.#volumePrefix(volume.name))),
        ...(service.initTasks ?? []).map((task) => this.#runInitTask(task)),
        this.#createContainer(service),
        docker("start", this.#containerName(service.name)),
      ]),
    ];
  }

  async status(services: readonly RuntimeServiceDefinition[]): Promise<RuntimeStatus> {
    return {
      runtime: "docker",
      available: true,
      services: await Promise.all(
        services.map(async (service) => {
          const result = await this.#executor.run(
            docker(
              "inspect",
              "--format",
              "{{json .State}}",
              this.#containerName(service.name),
            ),
          );
          if (result.exitCode !== 0) {
            return missingServiceStatus(
              service.name,
              compactMessage(result.stderr, result.stdout, "Container is missing."),
            );
          }
          return parseContainerState(service.name, result.stdout);
        }),
      ),
    };
  }

  planStop(services: readonly RuntimeServiceDefinition[]): readonly CommandSpec[] {
    return services.map((service) =>
      dockerAllowFailure("stop", this.#containerName(service.name)),
    );
  }

  planDestroy(services: readonly RuntimeServiceDefinition[]): readonly CommandSpec[] {
    return [
      ...services.flatMap((service) => [
        dockerAllowFailure("rm", "-f", this.#containerName(service.name)),
        ...service.volumes
          .filter((volume) => volume.source?.type !== "bind")
          .map((volume) =>
            dockerAllowFailure("volume", "rm", this.#volumePrefix(volume.name)),
          ),
      ]),
      dockerAllowFailure("network", "rm", this.#networkName),
    ];
  }

  #createContainer(service: RuntimeServiceDefinition): CommandSpec {
    const args = [
      "create",
      "--name",
      this.#containerName(service.name),
      "--network",
      this.#networkName,
      "--network-alias",
      service.name,
      "--label",
      `athena-local.project=${this.#projectName}`,
      ...service.ports.flatMap((port) => [
        "--publish",
        `${port.hostPort}:${port.containerPort}/${port.protocol}`,
      ]),
      ...Object.entries(service.env ?? {}).flatMap(([key, value]) => [
        "--env",
        `${key}=${value}`,
      ]),
      ...service.volumes.flatMap((volume) => [
        "--volume",
        `${this.#volumeSource(volume)}:${volume.target}${volume.readonly === true ? ":ro" : ""}`,
      ]),
      service.image,
      ...(service.command ?? []),
    ];

    return createCommandSpec("docker", args);
  }

  #runInitTask(
    task: NonNullable<RuntimeServiceDefinition["initTasks"]>[number],
  ): CommandSpec {
    return docker(
      "run",
      "--rm",
      "--user",
      "0",
      ...task.volumes.flatMap((volume) => [
        "--volume",
        `${this.#volumeSource(volume)}:${volume.target}${volume.readonly === true ? ":ro" : ""}`,
      ]),
      task.image,
      ...task.command,
    );
  }

  #validateServices(services: readonly RuntimeServiceDefinition[]): void {
    const names = new Set<string>();
    for (const service of services) {
      const issues = [...validateServiceDefinition(service)];
      if (names.has(service.name)) {
        issues.push(`Duplicate service name: ${service.name}.`);
      }
      names.add(service.name);
      if (issues.length > 0) {
        throw new Error(issues.join(" "));
      }
    }
  }

  #containerName(serviceName: string): string {
    return `${this.#projectName}-${serviceName}`;
  }

  #volumePrefix(name: string): string {
    return `${this.#projectName}-${name}`;
  }

  #volumeSource(volume: RuntimeServiceDefinition["volumes"][number]): string {
    if (volume.source?.type === "bind") {
      return volume.source.path;
    }
    return this.#volumePrefix(volume.name);
  }
}

function docker(...args: readonly string[]): CommandSpec {
  return createCommandSpec("docker", args);
}

function dockerAllowFailure(...args: readonly string[]): CommandSpec {
  return createCommandSpec("docker", args, { allowFailure: true });
}

export function parseDockerVersion(output: string): string | undefined {
  return output.match(/\d+(?:\.\d+){1,3}/)?.[0];
}

function compactMessage(...values: readonly string[]): string {
  const message = values.map((value) => value.trim()).find((value) => value.length > 0);
  return message ?? "Docker is not available.";
}
