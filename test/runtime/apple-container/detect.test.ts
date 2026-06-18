import { describe, expect, test } from "bun:test";
import { AppleContainerRuntimeAdapter } from "../../../src/runtime/apple-container.ts";

/**
 * Live Apple `container` runtime checks. These run only when the `container`
 * CLI is installed and responsive, so the suite is a no-op on Linux and CI
 * runners without Apple container support. Command-generation behavior is
 * covered without a runtime in test/unit/apple-container-runtime.test.ts.
 */
function appleContainerUsable(): boolean {
  if (Bun.which("container") === null) {
    return false;
  }
  const result = Bun.spawnSync({
    cmd: ["container", "--version"],
    stdout: "ignore",
    stderr: "ignore",
  });
  return result.exitCode === 0;
}

const usable = appleContainerUsable();

describe("Apple container runtime detection", () => {
  test.skipIf(!usable)(
    "detects the installed runtime and parses its version",
    async () => {
      const adapter = new AppleContainerRuntimeAdapter({
        projectName: "athena-local-test",
        networkName: "athena-local-test",
      });

      const status = await adapter.detect();
      expect(status.runtime).toBe("apple-container");
      expect(status.available).toBe(true);
      expect(status.version).toMatch(/\d+\.\d+/);
    },
  );

  test.skipIf(usable)("is skipped when Apple container is unavailable", () => {
    expect(usable).toBe(false);
  });
});
