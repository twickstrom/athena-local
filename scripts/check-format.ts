// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

const textExtensions = new Set([
  ".json",
  ".md",
  ".ts",
  ".yml",
  ".yaml",
  ".gitignore",
  ".editorconfig",
]);

const ignoredDirectories = new Set([
  ".git",
  ".athena-local",
  ".local",
  "coverage",
  "dist",
  "node_modules",
]);

const write = Bun.argv.includes("--write");
const failures: string[] = [];

function extensionFor(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  const basename = lastSlash === -1 ? path : path.slice(lastSlash + 1);
  if (basename.startsWith(".")) {
    return basename;
  }
  const lastDot = basename.lastIndexOf(".");
  return lastDot === -1 ? "" : basename.slice(lastDot);
}

async function* walk(directory: string): AsyncGenerator<string> {
  for (const entry of new Bun.Glob("*").scanSync({ cwd: directory, dot: true })) {
    const path = directory === "." ? entry : `${directory}/${entry}`;
    const file = Bun.file(path);
    const stat = await file.stat();

    if (stat.isDirectory()) {
      if (!ignoredDirectories.has(entry)) {
        yield* walk(path);
      }
      continue;
    }

    if (stat.isFile() && textExtensions.has(extensionFor(path))) {
      yield path;
    }
  }
}

for await (const path of walk(".")) {
  const file = Bun.file(path);
  const original = await file.text();
  const formatted = original.replace(/[ \t]+$/gm, "").replace(/\n*$/u, "\n");

  if (formatted !== original) {
    if (write) {
      await Bun.write(path, formatted);
    } else {
      failures.push(path);
    }
  }
}

if (failures.length > 0) {
  console.error("Formatting issues found:");
  for (const path of failures) {
    console.error(`- ${path}`);
  }
  process.exit(1);
}
