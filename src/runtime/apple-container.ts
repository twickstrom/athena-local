import { createCommandSpec, type CommandSpec } from "../process/command.ts";
import {
  type RuntimeAdapter,
  type RuntimeServiceDefinition,
  type RuntimeStatus,
  validateServiceDefinition,
} from "./types.ts";

export interface AppleContainerAdapterOptions {
  readonly projectName: string;
  readonly networkName: string;
}

export class AppleContainerRuntimeAdapter implements RuntimeAdapter {
  readonly kind = "apple-container";
  readonly #projectName: string;
  readonly #networkName: string;

  constructor(options: AppleContainerAdapterOptions) {
    this.#projectName = options.projectName;
    this.#networkName = options.networkName;
  }

  async detect(): Promise<RuntimeStatus> {
    return {
      runtime: "apple-container",
      available: false,
      services: [],
      message: "Runtime detection requires a process executor and is implemented in a later milestone.",
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
