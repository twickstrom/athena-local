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

export interface AppleContainerAdapterOptions {
  readonly projectName: string;
  readonly networkName: string;
  readonly executor?: ProcessExecutor;
}

export class AppleContainerRuntimeAdapter implements RuntimeAdapter {
  readonly kind = "apple-container";
  readonly #projectName: string;
  readonly #networkName: string;
  readonly #executor: ProcessExecutor;

  constructor(options: AppleContainerAdapterOptions) {
    this.#projectName = options.projectName;
    this.#networkName = options.networkName;
    this.#executor = options.executor ?? createBunProcessExecutor();
  }

  async detect(): Promise<RuntimeStatus> {
    const result = await this.#executor.run(container("--version"));

    if (result.exitCode !== 0) {
      return {
        runtime: "apple-container",
        available: false,
        services: [],
        message: compactMessage(
          result.stderr,
          result.stdout,
          "Apple container is not available.",
        ),
      };
    }

    const version = parseAppleContainerVersion(result.stdout);

    return {
      runtime: "apple-container",
      available: true,
      services: [],
      ...(version === undefined ? {} : { version }),
    };
  }

  planStart(services: readonly RuntimeServiceDefinition[]): readonly CommandSpec[] {
    this.#validateServices(services);
    return [
      container("network", "create", this.#networkName),
      ...services.flatMap((service) => [
        container("image", "pull", service.image),
        ...service.volumes.map((volume) =>
          container("volume", "create", this.#volumeName(volume.name)),
        ),
        this.#createContainer(service),
        container("start", this.#containerName(service.name)),
      ]),
    ];
  }

  async status(services: readonly RuntimeServiceDefinition[]): Promise<RuntimeStatus> {
    return {
      runtime: "apple-container",
      available: true,
      services: await Promise.all(
        services.map(async (service) => {
          const result = await this.#executor.run(
            container("inspect", this.#containerName(service.name)),
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
      container("stop", this.#containerName(service.name)),
    );
  }

  planDestroy(services: readonly RuntimeServiceDefinition[]): readonly CommandSpec[] {
    return [
      ...services.flatMap((service) => [
        container("rm", this.#containerName(service.name)),
        ...service.volumes.map((volume) =>
          container("volume", "rm", this.#volumeName(volume.name)),
        ),
      ]),
      container("network", "rm", this.#networkName),
    ];
  }

  #createContainer(service: RuntimeServiceDefinition): CommandSpec {
    return container(
      "create",
      "--name",
      this.#containerName(service.name),
      "--network",
      this.#networkName,
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
        `${this.#volumeName(volume.name)}:${volume.target}${volume.readonly === true ? ":ro" : ""}`,
      ]),
      service.image,
      ...(service.command ?? []),
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

  #volumeName(name: string): string {
    return `${this.#projectName}-${name}`;
  }
}

function container(...args: readonly string[]): CommandSpec {
  return createCommandSpec("container", args);
}

export function parseAppleContainerVersion(output: string): string | undefined {
  return output.match(/\d+(?:\.\d+){1,3}/)?.[0];
}

function compactMessage(...values: readonly string[]): string {
  const message = values.map((value) => value.trim()).find((value) => value.length > 0);
  return message ?? "Apple container is not available.";
}
