// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import type {
  ConfigIssue,
  ConfigSources,
  PartialAthenaLocalConfig,
} from "./types.ts";

export const projectConfigFile = "athena-local.config.json";
export const localConfigFile = ".athena-local/config.local.json";

export interface LoadedConfigFiles {
  readonly sources: Pick<ConfigSources, "projectConfig" | "localConfig">;
  readonly issues: readonly ConfigIssue[];
}

export async function loadConfigFiles(root: string): Promise<LoadedConfigFiles> {
  const issues: ConfigIssue[] = [];
  const projectConfig = await readConfigFile(
    joinPath(root, projectConfigFile),
    "projectConfig",
    issues,
  );
  const localConfig = await readConfigFile(
    joinPath(root, localConfigFile),
    "localConfig",
    issues,
  );

  return {
    sources: {
      ...(projectConfig === undefined ? {} : { projectConfig }),
      ...(localConfig === undefined ? {} : { localConfig }),
    },
    issues,
  };
}

async function readConfigFile(
  path: string,
  field: "projectConfig" | "localConfig",
  issues: ConfigIssue[],
): Promise<PartialAthenaLocalConfig | undefined> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch (error) {
    issues.push({
      field,
      message: `Could not parse ${path}: ${error instanceof Error ? error.message : "invalid JSON"}.`,
    });
    return undefined;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    issues.push({
      field,
      message: `${path} must contain a JSON object.`,
    });
    return undefined;
  }

  return parsed as PartialAthenaLocalConfig;
}

function joinPath(root: string, path: string): string {
  return `${root.replace(/\/+$/, "")}/${path}`;
}
