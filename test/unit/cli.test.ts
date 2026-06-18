import { describe, expect, test } from "bun:test";
import { parseArgs } from "../../src/cli/args.ts";
import { runCli } from "../../src/cli/run.ts";

describe("CLI arguments", () => {
  test("parses command options into config overrides", () => {
    const parsed = parseArgs([
      "doctor",
      "--json",
      "--runtime",
      "docker",
      "--storage-backend",
      "s3",
      "--s3-bucket",
      "example-dev",
      "--s3-prefix",
      "athena-local/dev/",
    ]);

    expect(parsed.errors).toEqual([]);
    expect(parsed.command).toBe("doctor");
    expect(parsed.json).toBe(true);
    expect(parsed.config).toEqual({
      containerRuntime: "docker",
      outputMode: "json",
      s3Bucket: "example-dev",
      s3Prefix: "athena-local/dev/",
      storageBackend: "s3",
    });
  });

  test("reports unknown options", () => {
    const parsed = parseArgs(["status", "--wat"]);

    expect(parsed.errors).toEqual(["Unknown option: --wat"]);
  });
});

describe("CLI runner", () => {
  test("renders JSON doctor output with redacted profile", () => {
    const result = runCli(["doctor", "--json"], {
      env: {
        AWS_PROFILE: "dev-admin",
        ATHENA_LOCAL_CONTAINER_RUNTIME: "docker",
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");

    const output = JSON.parse(result.stdout) as {
      ok: boolean;
      command: string;
      config: {
        awsProfile?: string;
        containerRuntime?: string;
      };
      runtimePlan: {
        runtime: string;
        serviceCount: number;
      };
      checks: string[];
    };

    expect(output.ok).toBe(true);
    expect(output.command).toBe("doctor");
    expect(output.config.awsProfile).toBe("[redacted]");
    expect(output.config.containerRuntime).toBe("docker");
    expect(output.runtimePlan).toMatchObject({
      runtime: "docker",
      serviceCount: 4,
    });
    expect(output.checks).toContain("storage-safety");
  });

  test("fails safely for unsafe S3 prefixes", () => {
    const result = runCli([
      "start",
      "--storage-backend",
      "s3",
      "--s3-bucket",
      "example-dev",
      "--s3-prefix",
      "../prod",
    ]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("s3Prefix");
    expect(result.stdout).toBe("");
  });

  test("shows help without requiring a command", () => {
    const result = runCli(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("athena-local <command>");
    expect(result.stderr).toBe("");
  });

  test("gates facade server startup behind explicit facade-only flag", () => {
    const placeholder = runCli(["start"]);
    expect(placeholder.action).toBeUndefined();
    expect(placeholder.stdout).toContain(
      "runtime behavior will be added by the runtime adapter milestone",
    );

    const facadeOnly = runCli(["start", "--facade-only", "--port", "4568"]);
    expect(facadeOnly.action).toEqual({
      type: "serve-facade",
      port: 4568,
    });
    expect(facadeOnly.stdout).toContain("Starting Athena facade on port 4568.");
  });
});
