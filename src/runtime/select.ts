import { createLocalStackServices } from "../infra/services.ts";
import type { RuntimeConfigPaths } from "../infra/runtime-config.ts";
import { AppleContainerRuntimeAdapter } from "./apple-container.ts";
import { DockerRuntimeAdapter } from "./docker.ts";
import type { ContainerRuntime } from "../config/types.ts";
import { redactCommand, type CommandSpec } from "../process/command.ts";

export interface RuntimePlanSummary {
  readonly runtime: ContainerRuntime;
  readonly serviceCount: number;
  readonly startCommandCount: number;
  readonly stopCommandCount: number;
  readonly destroyCommandCount: number;
  readonly services: readonly string[];
}

export type RuntimePlanCommand = "start" | "stop" | "reset" | "destroy";

export interface RuntimeCommandPlan {
  readonly runtime: ContainerRuntime;
  readonly command: RuntimePlanCommand;
  readonly commands: readonly CommandSpec[];
}

export function createRuntimePlanSummary(input: {
  readonly runtime: ContainerRuntime;
  readonly projectName: string;
  readonly networkName: string;
  readonly configPaths?: RuntimeConfigPaths;
}): RuntimePlanSummary {
  const services = createLocalStackServices(input.configPaths);
  const adapter =
    input.runtime === "docker"
      ? new DockerRuntimeAdapter({
          projectName: input.projectName,
          networkName: input.networkName,
        })
      : new AppleContainerRuntimeAdapter({
          projectName: input.projectName,
          networkName: input.networkName,
        });

  return {
    runtime: input.runtime,
    serviceCount: services.length,
    startCommandCount: adapter.planStart(services).length,
    stopCommandCount: adapter.planStop(services).length,
    destroyCommandCount: adapter.planDestroy(services).length,
    services: services.map((service) => service.name),
  };
}

export function createRuntimeCommandPlan(input: {
  readonly runtime: ContainerRuntime;
  readonly command: RuntimePlanCommand;
  readonly projectName: string;
  readonly networkName: string;
  readonly redact?: boolean;
  readonly configPaths?: RuntimeConfigPaths;
}): RuntimeCommandPlan {
  const services = createLocalStackServices(input.configPaths);
  const adapter = createAdapter(input);
  const commands = commandPlan(input.command, adapter, services);

  return {
    runtime: input.runtime,
    command: input.command,
    commands: input.redact === true ? commands.map(redactCommand) : commands,
  };
}

function createAdapter(input: {
  readonly runtime: ContainerRuntime;
  readonly projectName: string;
  readonly networkName: string;
}): DockerRuntimeAdapter | AppleContainerRuntimeAdapter {
  return input.runtime === "docker"
    ? new DockerRuntimeAdapter({
        projectName: input.projectName,
        networkName: input.networkName,
      })
    : new AppleContainerRuntimeAdapter({
        projectName: input.projectName,
        networkName: input.networkName,
      });
}

function commandPlan(
  command: RuntimePlanCommand,
  adapter: DockerRuntimeAdapter | AppleContainerRuntimeAdapter,
  services: ReturnType<typeof createLocalStackServices>,
): readonly CommandSpec[] {
  switch (command) {
    case "start":
      return adapter.planStart(services);
    case "stop":
      return adapter.planStop(services);
    case "destroy":
      return adapter.planDestroy(services);
    case "reset":
      return [...adapter.planDestroy(services), ...adapter.planStart(services)];
  }
}
