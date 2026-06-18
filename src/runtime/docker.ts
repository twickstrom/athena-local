import { createCommandSpec, type CommandSpec } from "../process/command.ts";
import {
  type RuntimeAdapter,
  type RuntimeServiceDefinition,
  type RuntimeStatus,
  validateServiceDefinition,
} from "./types.ts";

export interface DockerAdapterOptions {
  readonly projectName: string;
  readonly networkName: string;
}

export class DockerRuntimeAdapter implements RuntimeAdapter {
  readonly kind = "docker";
  readonly #projectName: string;
  readonly #networkName: string;

  constructor(options: DockerAdapterOptions) {
    this.#projectName = options.projectName;
    this.#networkName = options.networkName;
  }

  async detect(): Promise<RuntimeStatus> {
    return {
      runtime: "docker",
      available: false,
      services: [],
      message: "Runtime detection requires a process executor and is implemented in a later milestone.",
    } as RuntimeStatus;
  }

  planStart(services: readonly RuntimeServiceDefinition[]): readonly CommandSpec[] {
    this.#validateServices(services);
    return [
      docker("network", "create", this.#networkName),
      ...services.flatMap((service) => [
        docker("pull", service.image),
        ...service.volumes.map((volume) =>
          docker("volume", "create", this.#volumePrefix(volume.name)),
        ),
        this.#createContainer(service),
        docker("start", this.#containerName(service.name)),
      ]),
    ];
  }

  planStop(services: readonly RuntimeServiceDefinition[]): readonly CommandSpec[] {
    return services.map((service) => docker("stop", this.#containerName(service.name)));
  }

  planDestroy(services: readonly RuntimeServiceDefinition[]): readonly CommandSpec[] {
    return [
      ...services.flatMap((service) => [
        docker("rm", "-f", this.#containerName(service.name)),
        docker("volume", "rm", this.#volumePrefix(service.name)),
      ]),
      docker("network", "rm", this.#networkName),
    ];
  }

  #createContainer(service: RuntimeServiceDefinition): CommandSpec {
    const args = [
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
        `${this.#volumePrefix(volume.name)}:${volume.target}${volume.readonly === true ? ":ro" : ""}`,
      ]),
      service.image,
      ...(service.command ?? []),
    ];

    return createCommandSpec("docker", args);
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
}

function docker(...args: readonly string[]): CommandSpec {
  return createCommandSpec("docker", args);
}
