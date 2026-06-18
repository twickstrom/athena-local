import { createLocalStackServices } from "../infra/services.ts";
import { AppleContainerRuntimeAdapter } from "./apple-container.ts";
import { DockerRuntimeAdapter } from "./docker.ts";
import type { ContainerRuntime } from "../config/types.ts";

export interface RuntimePlanSummary {
  readonly runtime: ContainerRuntime;
  readonly serviceCount: number;
  readonly startCommandCount: number;
  readonly stopCommandCount: number;
  readonly destroyCommandCount: number;
  readonly services: readonly string[];
}

export function createRuntimePlanSummary(input: {
  readonly runtime: ContainerRuntime;
  readonly projectName: string;
  readonly networkName: string;
}): RuntimePlanSummary {
  const services = createLocalStackServices();
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
