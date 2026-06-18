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
