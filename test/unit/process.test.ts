import { describe, expect, test } from "bun:test";
import { createCommandSpec, redactCommand } from "../../src/process/command.ts";

describe("process command construction", () => {
  test("creates argv-based command specs", () => {
    const command = createCommandSpec("docker", ["version", "--format", "json"]);

    expect(command).toEqual({
      executable: "docker",
      args: ["version", "--format", "json"],
    });
  });

  test("rejects unsafe executables and null-byte arguments", () => {
    expect(() => createCommandSpec("docker;rm", [])).toThrow(
      "Executable must be a non-empty path-like token.",
    );
    expect(() => createCommandSpec("docker", ["hello\0world"])).toThrow(
      "Command arguments must not contain null bytes.",
    );
  });

  test("redacts sensitive environment values", () => {
    const redacted = redactCommand(
      createCommandSpec("docker", ["login"], {
        env: {
          AWS_SECRET_ACCESS_KEY: "real-secret",
          NORMAL_VALUE: "visible",
        },
      }),
    );

    expect(redacted.env).toEqual({
      AWS_SECRET_ACCESS_KEY: "[redacted]",
      NORMAL_VALUE: "visible",
    });
  });

  test("redacts sensitive assignment arguments", () => {
    const redacted = redactCommand(
      createCommandSpec("docker", [
        "create",
        "--env",
        "MINIO_ROOT_PASSWORD=local-secret",
        "--env",
        "TRINO_ENVIRONMENT=local",
      ]),
    );

    expect(redacted.args).toEqual([
      "create",
      "--env",
      "MINIO_ROOT_PASSWORD=[redacted]",
      "--env",
      "TRINO_ENVIRONMENT=local",
    ]);
  });
});
