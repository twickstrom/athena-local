import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const requiredSourceFiles = [
  "README.md",
  "LICENSE",
  "package.json",
  "src/cli.ts",
  "docs/mvp-implementation-plan.md",
];

const forbiddenSourceFiles = [
  ".env",
  ".env.local",
  "athena-state.sqlite",
  "local.sqlite",
];

const requiredPackageFiles = [
  "package/README.md",
  "package/LICENSE",
  "package/package.json",
  "package/src/cli.ts",
  "package/docs/mvp-implementation-plan.md",
];

const forbiddenPackagePatterns = [
  /^package\/\.env(?:\.|$)/,
  /^package\/\.git\//,
  /^package\/\.athena-local\//,
  /^package\/node_modules\//,
  /^package\/.*\.sqlite(?:-|$)/,
  /^package\/.*\.sqlite-(?:shm|wal)$/,
  /^package\/.*\.db$/,
  /^package\/.*\.log$/,
  /^package\/.*\.tgz$/,
  /^package\/.*\.DS_Store$/,
];

const forbiddenSecretPatterns = [
  "aws_" + "access_key_id",
  "aws_" + "secret_access_key",
  "github_" + "pat_",
  "gh" + "p_",
];

for (const path of requiredSourceFiles) {
  if (!(await Bun.file(path).exists())) {
    fail(`Missing required source file: ${path}`);
  }
}

for (const path of forbiddenSourceFiles) {
  if (await Bun.file(path).exists()) {
    fail(`Forbidden source file exists: ${path}`);
  }
}

for (const pattern of forbiddenSecretPatterns) {
  const result = await runCommand([
    "rg",
    "-n",
    pattern,
    ".",
    "--glob",
    "!node_modules/**",
    "--glob",
    "!scripts/package-smoke.ts",
    "--glob",
    "!bun.lock",
    "--glob",
    "!.git/**",
  ]);
  if (result.exitCode === 0) {
    fail(`Forbidden secret pattern found: ${pattern}\n${result.stdout}`);
  }
}

const packageDir = mkdtempSync(join(tmpdir(), "athena-local-pack-"));
const pack = await runCommand([
  "bun",
  "pm",
  "pack",
  "--destination",
  packageDir,
  "--ignore-scripts",
  "--quiet",
]);

if (pack.exitCode !== 0) {
  fail(`bun pm pack failed:\n${pack.stderr}${pack.stdout}`);
}

const tarballName = pack.stdout.trim().split("\n").at(-1);
if (tarballName === undefined || tarballName.length === 0) {
  fail("bun pm pack did not report a tarball filename.");
}

const tarball = tarballName.startsWith("/") ? tarballName : join(packageDir, tarballName);
if (!(await Bun.file(tarball).exists())) {
  fail(`Package tarball was not created: ${tarball}`);
}

const listed = await runCommand(["tar", "-tzf", tarball]);
if (listed.exitCode !== 0) {
  fail(`Could not list package tarball:\n${listed.stderr}${listed.stdout}`);
}

const packageFiles = listed.stdout
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.length > 0);

for (const path of requiredPackageFiles) {
  if (!packageFiles.includes(path)) {
    fail(`Package tarball is missing required file: ${path}`);
  }
}

const forbiddenPackageFile = packageFiles.find((path) =>
  forbiddenPackagePatterns.some((pattern) => pattern.test(path)),
);
if (forbiddenPackageFile !== undefined) {
  fail(`Package tarball contains forbidden file: ${forbiddenPackageFile}`);
}

const packageJson = await extractPackageJson(tarball);
if (packageJson.license !== "MIT") {
  fail("package.json license must be MIT.");
}
if (packageJson.bin?.["athena-local"] !== "./src/cli.ts") {
  fail("package.json must expose the athena-local CLI entry point.");
}
if (packageJson.engines?.bun !== ">=1.3.0") {
  fail("package.json must declare the supported Bun engine.");
}

console.log("Package smoke checks passed.");

interface CommandOutput {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

async function runCommand(args: readonly string[]): Promise<CommandOutput> {
  const subprocess = Bun.spawn([...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text(),
    subprocess.exited,
  ]);

  return { exitCode, stdout, stderr };
}

async function extractPackageJson(tarball: string): Promise<{
  readonly license?: string;
  readonly bin?: Record<string, string>;
  readonly engines?: Record<string, string>;
}> {
  const extracted = await runCommand(["tar", "-xOzf", tarball, "package/package.json"]);
  if (extracted.exitCode !== 0) {
    fail(`Could not extract package.json:\n${extracted.stderr}${extracted.stdout}`);
  }

  return JSON.parse(extracted.stdout) as {
    readonly license?: string;
    readonly bin?: Record<string, string>;
    readonly engines?: Record<string, string>;
  };
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
