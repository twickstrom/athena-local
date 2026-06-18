// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import { Socket } from "node:net";
import type { ProcessExecutor } from "../process/command.ts";
import type { RuntimeReadinessCheck, RuntimeServiceDefinition } from "./types.ts";

export interface ServiceReadinessResult {
  readonly service: string;
  readonly ready: boolean;
  readonly message?: string;
}

export interface ReadinessResult {
  readonly ready: boolean;
  readonly services: readonly ServiceReadinessResult[];
}

export interface ReadinessProbes {
  readonly http: (url: string, timeoutMs: number) => Promise<boolean>;
  readonly tcp: (host: string, port: number, timeoutMs: number) => Promise<boolean>;
  readonly command: (
    check: Extract<RuntimeReadinessCheck, { readonly type: "command" }>,
  ) => Promise<boolean>;
}

export interface ReadinessWaitOptions {
  readonly retryIntervalMs?: number;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

export async function waitForServicesReady(
  services: readonly RuntimeServiceDefinition[],
  probes: ReadinessProbes,
  options: ReadinessWaitOptions = {},
): Promise<ReadinessResult> {
  const results = await Promise.all(
    services.map((service) => waitForServiceReady(service, probes, options)),
  );
  return {
    ready: results.every((result) => result.ready),
    services: results,
  };
}

export function createDefaultReadinessProbes(
  executor: ProcessExecutor,
): ReadinessProbes {
  return {
    http: async (url, timeoutMs) => {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      return response.ok;
    },
    tcp: (host, port, timeoutMs) => checkTcp(host, port, timeoutMs),
    command: async (check) => {
      const result = await executor.run(check.command);
      return result.exitCode === 0;
    },
  };
}

async function waitForServiceReady(
  service: RuntimeServiceDefinition,
  probes: ReadinessProbes,
  options: ReadinessWaitOptions,
): Promise<ServiceReadinessResult> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => Bun.sleep(ms));
  const retryIntervalMs = options.retryIntervalMs ?? 250;
  const deadline = now() + service.readiness.timeoutMs;
  let lastMessage = "Readiness check timed out.";

  while (now() <= deadline) {
    try {
      if (await runReadinessCheck(service.readiness, probes)) {
        return {
          service: service.name,
          ready: true,
        };
      }
      lastMessage = "Readiness check returned not ready.";
    } catch (error) {
      lastMessage = error instanceof Error ? error.message : "Readiness check failed.";
    }
    await sleep(retryIntervalMs);
  }

  return {
    service: service.name,
    ready: false,
    message: lastMessage,
  };
}

function runReadinessCheck(
  check: RuntimeReadinessCheck,
  probes: ReadinessProbes,
): Promise<boolean> {
  switch (check.type) {
    case "http":
      return probes.http(check.url, check.timeoutMs);
    case "tcp":
      return probes.tcp(check.host, check.port, check.timeoutMs);
    case "command":
      return probes.command(check);
  }
}

function checkTcp(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    const finish = (ready: boolean): void => {
      socket.destroy();
      resolve(ready);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect({ host, port });
  });
}
