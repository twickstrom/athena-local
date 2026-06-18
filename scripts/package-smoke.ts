const requiredFiles = [
  "README.md",
  "LICENSE",
  "package.json",
  "src/cli.ts",
  "docs/mvp-implementation-plan.md",
];

for (const path of requiredFiles) {
  if (!(await Bun.file(path).exists())) {
    console.error(`Missing required package file: ${path}`);
    process.exit(1);
  }
}

const forbiddenFiles = [
  ".env",
  ".env.local",
  "athena-state.sqlite",
  "local.sqlite",
];

for (const path of forbiddenFiles) {
  if (await Bun.file(path).exists()) {
    console.error(`Forbidden package file exists: ${path}`);
    process.exit(1);
  }
}

const forbiddenSecretPatterns = [
  "aws_" + "access_key_id",
  "aws_" + "secret_access_key",
  "github_" + "pat_",
  "gh" + "p_",
];

for (const pattern of forbiddenSecretPatterns) {
  const proc = Bun.spawn(
    [
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
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const exitCode = await proc.exited;
  if (exitCode === 0) {
    const output = await new Response(proc.stdout).text();
    console.error(`Forbidden secret pattern found: ${pattern}`);
    console.error(output);
    process.exit(1);
  }
}

console.log("Package smoke checks passed.");
