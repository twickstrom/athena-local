// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import { describe, expect, test } from "bun:test";
import { DockerRuntimeAdapter } from "../../../src/runtime/docker.ts";

/**
 * Live Docker runtime checks. These run only when the Docker CLI is installed
 * and the daemon is reachable, so the suite is a no-op when Docker is absent.
 * Command-generation behavior is covered without a daemon in
 * test/unit/docker-runtime.test.ts.
 */
function dockerUsable(): boolean {
  if (Bun.which("docker") === null) {
    return false;
  }
  const result = Bun.spawnSync({
    cmd: ["docker", "version", "--format", "{{.Server.Version}}"],
    stdout: "ignore",
    stderr: "ignore",
  });
  return result.exitCode === 0;
}

const usable = dockerUsable();

describe("Docker runtime detection", () => {
  test.skipIf(!usable)(
    "detects the running daemon and parses its version",
    async () => {
      const adapter = new DockerRuntimeAdapter({
        projectName: "athena-local-test",
        networkName: "athena-local-test",
      });

      const status = await adapter.detect();
      expect(status.runtime).toBe("docker");
      expect(status.available).toBe(true);
      expect(status.version).toMatch(/\d+\.\d+/);
    },
  );

  test.skipIf(usable)("is skipped when Docker is unavailable", () => {
    expect(usable).toBe(false);
  });
});
