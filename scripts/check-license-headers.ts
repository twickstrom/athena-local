// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

// Fails if any first-party .ts file is missing the SPDX AGPL-3.0-only header.
// Keeps the AGPL provenance complete as new files are added. Run in CI / release.
import { Glob } from "bun";

const glob = new Glob("{src,scripts,test}/**/*.ts");
const missing: string[] = [];

for await (const path of glob.scan(".")) {
  const head = (await Bun.file(path).text()).slice(0, 200);
  if (!head.includes("SPDX-License-Identifier: AGPL-3.0-only")) {
    missing.push(path);
  }
}

if (missing.length > 0) {
  console.error(
    `Missing the SPDX AGPL-3.0-only header in ${missing.length} file(s):`,
  );
  for (const p of missing) console.error(`  ${p}`);
  console.error(
    "\nAdd:\n  // SPDX-License-Identifier: AGPL-3.0-only\n  // SPDX-FileCopyrightText: 2026 Tim Wickstrom",
  );
  process.exit(1);
}

console.log("All first-party .ts files carry the SPDX AGPL-3.0-only header.");
