#!/usr/bin/env bun

import { packageName, projectStatus } from "./index.ts";

const commands = [
  "configure",
  "doctor",
  "start",
  "stop",
  "status",
  "reset",
  "destroy",
  "seed",
] as const;

type Command = (typeof commands)[number];

function isCommand(value: string): value is Command {
  return commands.includes(value as Command);
}

function printHelp(): void {
  console.log(`${packageName} (${projectStatus})

Usage:
  athena-local <command> [--json]
  athena-local --help
  athena-local --version

Commands:
  configure   Planned interactive/noninteractive setup
  doctor      Planned environment and safety checks
  start       Planned local infrastructure startup
  stop        Planned local infrastructure stop without data deletion
  status      Planned local service status
  reset       Planned local reset
  destroy     Planned local destroy
  seed        Planned deterministic fixture seeding

Runtime operations are not implemented yet.`);
}

function printJson(command: Command): void {
  console.log(
    JSON.stringify(
      {
        command,
        implemented: false,
        packageName,
        status: projectStatus,
        message: "Runtime operations are planned but not implemented yet.",
      },
      null,
      2,
    ),
  );
}

const args = Bun.argv.slice(2);
const firstArg = args[0];

if (firstArg === undefined || firstArg === "--help" || firstArg === "-h") {
  printHelp();
  process.exit(0);
}

if (firstArg === "--version" || firstArg === "-v") {
  console.log("0.0.0");
  process.exit(0);
}

if (!isCommand(firstArg)) {
  console.error(`Unknown command: ${firstArg}`);
  printHelp();
  process.exit(2);
}

if (args.includes("--json")) {
  printJson(firstArg);
} else {
  console.log(
    `${packageName} ${firstArg}: runtime operations are planned but not implemented yet.`,
  );
}
