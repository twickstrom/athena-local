// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import type { PartialAthenaLocalConfig } from "../config/types.ts";

export const commands = [
  "configure",
  "doctor",
  "start",
  "stop",
  "status",
  "reset",
  "destroy",
  "seed",
] as const;

export type Command = (typeof commands)[number];

export interface ParsedArgs {
  readonly command?: Command;
  readonly help: boolean;
  readonly version: boolean;
  readonly json: boolean;
  readonly facadeOnly: boolean;
  readonly port?: number;
  readonly config: PartialAthenaLocalConfig;
  readonly errors: readonly string[];
}

export function parseArgs(args: readonly string[]): ParsedArgs {
  const errors: string[] = [];
  const config: Record<string, unknown> = {};
  let command: Command | undefined;
  let help = false;
  let version = false;
  let json = false;
  let facadeOnly = false;
  let port: number | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) {
      continue;
    }

    if (index === 0 && !arg.startsWith("-")) {
      if (isCommand(arg)) {
        command = arg;
      } else {
        errors.push(`Unknown command: ${arg}`);
      }
      continue;
    }

    switch (arg) {
      case "--help":
      case "-h":
        help = true;
        break;
      case "--version":
      case "-v":
        version = true;
        break;
      case "--json":
        json = true;
        config.outputMode = "json";
        break;
      case "--facade-only":
        facadeOnly = true;
        break;
      case "--port": {
        const raw = readOptionValue(args, index, arg, errors);
        const parsedPort = raw === undefined ? undefined : Number(raw);
        if (
          raw !== undefined &&
          (!Number.isInteger(parsedPort) ||
            parsedPort === undefined ||
            parsedPort < 1 ||
            parsedPort > 65535)
        ) {
          errors.push("--port must be an integer between 1 and 65535");
        }
        port = parsedPort;
        index += 1;
        break;
      }
      case "--runtime":
        config.containerRuntime = readOptionValue(args, index, arg, errors);
        index += 1;
        break;
      case "--storage-backend":
        config.storageBackend = readOptionValue(args, index, arg, errors);
        index += 1;
        break;
      case "--mode":
        config.executionMode = readOptionValue(args, index, arg, errors);
        index += 1;
        break;
      case "--project-id":
        config.projectId = readOptionValue(args, index, arg, errors);
        index += 1;
        break;
      case "--run-id":
        config.runId = readOptionValue(args, index, arg, errors);
        index += 1;
        break;
      case "--s3-bucket":
        config.s3Bucket = readOptionValue(args, index, arg, errors);
        index += 1;
        break;
      case "--s3-prefix":
        config.s3Prefix = readOptionValue(args, index, arg, errors);
        index += 1;
        break;
      default:
        errors.push(`Unknown option: ${arg}`);
        break;
    }
  }

  return {
    ...(command === undefined ? {} : { command }),
    help,
    version,
    json,
    facadeOnly,
    ...(port === undefined ? {} : { port }),
    config,
    errors,
  };
}

export function isCommand(value: string): value is Command {
  return commands.includes(value as Command);
}

function readOptionValue(
  args: readonly string[],
  index: number,
  option: string,
  errors: string[],
): string | undefined {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("-")) {
    errors.push(`Missing value for ${option}`);
    return undefined;
  }
  return value;
}
