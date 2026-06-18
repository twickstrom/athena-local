// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import type { CommandSpec } from "../process/command.ts";

export type RuntimeKind = "apple-container" | "docker";

export interface PortMapping {
  readonly name: string;
  readonly hostPort: number;
  readonly containerPort: number;
  readonly protocol: "tcp" | "udp";
}

export interface VolumeMount {
  readonly name: string;
  readonly source?:
    | {
        readonly type: "named";
      }
    | {
        readonly type: "bind";
        readonly path: string;
      };
  readonly target: string;
  readonly readonly?: boolean;
}

export interface RuntimeServiceDefinition {
  readonly name: string;
  readonly image: string;
  readonly initTasks?: readonly RuntimeInitTask[];
  readonly command?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly ports: readonly PortMapping[];
  readonly volumes: readonly VolumeMount[];
  readonly dependsOn: readonly string[];
  readonly readiness: RuntimeReadinessCheck;
}

export interface RuntimeInitTask {
  readonly image: string;
  readonly command: readonly string[];
  readonly volumes: readonly VolumeMount[];
}

export type RuntimeReadinessCheck =
  | {
      readonly type: "http";
      readonly url: string;
      readonly timeoutMs: number;
    }
  | {
      readonly type: "tcp";
      readonly host: string;
      readonly port: number;
      readonly timeoutMs: number;
    }
  | {
      readonly type: "command";
      readonly command: CommandSpec;
      readonly timeoutMs: number;
    };

export interface RuntimeStatus {
  readonly runtime: RuntimeKind;
  readonly available: boolean;
  readonly version?: string;
  readonly services: readonly ServiceStatus[];
  readonly message?: string;
}

export interface ServiceStatus {
  readonly name: string;
  readonly state: "missing" | "created" | "starting" | "running" | "stopped" | "failed";
  readonly healthy: boolean;
  readonly message?: string;
}

export interface RuntimeAdapter {
  readonly kind: RuntimeKind;
  readonly detect: () => Promise<RuntimeStatus>;
  readonly status: (
    services: readonly RuntimeServiceDefinition[],
  ) => Promise<RuntimeStatus>;
  readonly planStart: (
    services: readonly RuntimeServiceDefinition[],
  ) => readonly CommandSpec[];
  readonly planStop: (
    services: readonly RuntimeServiceDefinition[],
  ) => readonly CommandSpec[];
  readonly planDestroy: (
    services: readonly RuntimeServiceDefinition[],
  ) => readonly CommandSpec[];
}

export function validateServiceDefinition(
  service: RuntimeServiceDefinition,
): readonly string[] {
  const issues: string[] = [];

  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(service.name)) {
    issues.push("Service name must be a safe identifier.");
  }

  if (service.image.length === 0 || service.image.endsWith(":latest")) {
    issues.push("Service image must be pinned and must not use latest.");
  }

  for (const task of service.initTasks ?? []) {
    if (task.image.length === 0 || task.image.endsWith(":latest")) {
      issues.push("Init task image must be pinned and must not use latest.");
    }
    if (task.command.length === 0) {
      issues.push("Init task command must not be empty.");
    }
  }

  const portNames = new Set<string>();
  for (const port of service.ports) {
    if (portNames.has(port.name)) {
      issues.push(`Duplicate port mapping name: ${port.name}.`);
    }
    portNames.add(port.name);
    if (!isPort(port.hostPort) || !isPort(port.containerPort)) {
      issues.push(`Invalid port mapping: ${port.name}.`);
    }
  }

  return issues;
}

function isPort(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 65535;
}
