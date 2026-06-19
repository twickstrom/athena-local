// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

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

  async resolveHostGateway(): Promise<string> {
    // Apple container has no inter-container name DNS, so services reach each
    // other (and an external host object store) through the network gateway plus
    // host-published ports. Create the network if needed, then read its gateway.
    await this.#executor.run(
      containerAllowFailure("network", "create", this.#networkName),
    );
    const result = await this.#executor.run(
      container("network", "inspect", this.#networkName),
    );
    if (result.exitCode !== 0) {
      throw new Error(
        compactMessage(result.stderr, result.stdout, "Could not inspect network."),
      );
    }
    const gateway = parseNetworkGateway(result.stdout);
    if (gateway === undefined) {
      throw new Error(
        `Could not determine the gateway for network ${this.#networkName}.`,
      );
    }
    return gateway;
  }

  planStart(services: readonly RuntimeServiceDefinition[]): readonly CommandSpec[] {
    this.#validateServices(services);
    return [
      // resolveHostGateway already creates the network; tolerate it existing.
      containerAllowFailure("network", "create", this.#networkName),
      ...services.flatMap((service) => [
        container("image", "pull", service.image),
        ...(service.initTasks ?? []).map((task) =>
          container("image", "pull", task.image),
        ),
        ...service.volumes
          .filter((volume) => volume.source?.type !== "bind")
          // Tolerate a leftover volume from a prior run: Apple `container volume
          // create` errors on an existing name (Docker's is idempotent), so a
          // named data volume that survived a stop would otherwise fail the
          // start. A genuinely absent volume still surfaces at `container create`.
          .map((volume) =>
            containerAllowFailure("volume", "create", this.#volumeName(volume.name)),
          ),
        ...(service.initTasks ?? []).map((task) => this.#runInitTask(task)),
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
      containerAllowFailure("stop", this.#containerName(service.name)),
    );
  }

  planDestroy(services: readonly RuntimeServiceDefinition[]): readonly CommandSpec[] {
    return [
      ...services.flatMap((service) => [
        containerAllowFailure("rm", "--force", this.#containerName(service.name)),
        ...service.volumes
          .filter((volume) => volume.source?.type !== "bind")
          .map((volume) =>
            containerAllowFailure("volume", "rm", this.#volumeName(volume.name)),
          ),
      ]),
      containerAllowFailure("network", "rm", this.#networkName),
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
        `${this.#volumeSource(volume)}:${volume.target}${volume.readonly === true ? ":ro" : ""}`,
      ]),
      service.image,
      ...(service.command ?? []),
    );
  }

  #runInitTask(
    task: NonNullable<RuntimeServiceDefinition["initTasks"]>[number],
  ): CommandSpec {
    return container(
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

  #volumeName(name: string): string {
    return `${this.#projectName}-${name}`;
  }

  #volumeSource(volume: RuntimeServiceDefinition["volumes"][number]): string {
    if (volume.source?.type === "bind") {
      return volume.source.path;
    }
    return this.#volumeName(volume.name);
  }
}

function container(...args: readonly string[]): CommandSpec {
  return createCommandSpec("container", args);
}

function containerAllowFailure(...args: readonly string[]): CommandSpec {
  return createCommandSpec("container", args, { allowFailure: true });
}

export function parseAppleContainerVersion(output: string): string | undefined {
  return output.match(/\d+(?:\.\d+){1,3}/)?.[0];
}

// Reads ipv4Gateway from `container network inspect` JSON, tolerating both the
// documented array shape and a bare object.
export function parseNetworkGateway(output: string): string | undefined {
  try {
    const parsed = JSON.parse(output) as unknown;
    const entry = Array.isArray(parsed) ? parsed[0] : parsed;
    const status = (entry as { status?: { ipv4Gateway?: unknown } } | undefined)
      ?.status;
    if (typeof status?.ipv4Gateway === "string" && status.ipv4Gateway.length > 0) {
      return status.ipv4Gateway;
    }
  } catch {
    // Fall through to the regex below.
  }
  const match = output.match(/"ipv4Gateway"\s*:\s*"([^"]+)"/);
  return match?.[1];
}

function compactMessage(...values: readonly string[]): string {
  const message = values.map((value) => value.trim()).find((value) => value.length > 0);
  return message ?? "Apple container is not available.";
}
