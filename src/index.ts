// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const packageName = "athena-local";

// Read the shipped package.json (src/ is published next to it, so this resolves
// in the installed package too) rather than hard-coding a version that drifts.
export const projectVersion = readProjectVersion();

function readProjectVersion(): string {
  try {
    const pkgPath = fileURLToPath(new URL("../package.json", import.meta.url));
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      readonly version?: string;
    };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export const plannedAthenaOperations = [
  "StartQueryExecution",
  "GetQueryExecution",
  "GetQueryResults",
  "StopQueryExecution",
] as const;

export type PlannedAthenaOperation = (typeof plannedAthenaOperations)[number];
