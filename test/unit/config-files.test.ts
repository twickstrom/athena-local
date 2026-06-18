import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadConfigFiles,
  localConfigFile,
  projectConfigFile,
} from "../../src/config/files.ts";

describe("configuration file loading", () => {
  test("loads committed project config and uncommitted local config", async () => {
    const root = createTempRoot();
    await Bun.write(
      join(root, projectConfigFile),
      JSON.stringify({
        projectId: "project-file",
        storageBackend: "minio",
      }),
    );
    mkdirSync(join(root, ".athena-local"), { recursive: true });
    await Bun.write(
      join(root, localConfigFile),
      JSON.stringify({
        projectId: "local-file",
        containerRuntime: "docker",
      }),
    );

    const loaded = await loadConfigFiles(root);

    expect(loaded.issues).toEqual([]);
    expect(loaded.sources).toEqual({
      projectConfig: {
        projectId: "project-file",
        storageBackend: "minio",
      },
      localConfig: {
        projectId: "local-file",
        containerRuntime: "docker",
      },
    });
  });

  test("ignores missing config files", async () => {
    const loaded = await loadConfigFiles(createTempRoot());

    expect(loaded).toEqual({
      sources: {},
      issues: [],
    });
  });

  test("reports malformed and non-object config files", async () => {
    const root = createTempRoot();
    await Bun.write(join(root, projectConfigFile), "{ nope");
    mkdirSync(join(root, ".athena-local"), { recursive: true });
    await Bun.write(join(root, localConfigFile), "[]");

    const loaded = await loadConfigFiles(root);

    expect(loaded.sources).toEqual({});
    expect(loaded.issues).toHaveLength(2);
    expect(loaded.issues[0]?.field).toBe("projectConfig");
    expect(loaded.issues[0]?.message).toContain("Could not parse");
    expect(loaded.issues[1]).toEqual({
      field: "localConfig",
      message: `${join(root, localConfigFile)} must contain a JSON object.`,
    });
  });
});

function createTempRoot(): string {
  return mkdtempSync(join(tmpdir(), "athena-local-config-"));
}
