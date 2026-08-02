import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const roots = ["app", "components", "lib", "server", "scripts"];

function collectTests(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectTests(target);
    return entry.isFile() && entry.name.endsWith(".test.mts") ? [target] : [];
  });
}

const tests = roots.filter(existsSync).flatMap(collectTests).sort();
const failures = [];

for (const test of tests) {
  process.stdout.write(`\n--- ${test}\n`);
  const result = spawnSync(
    process.execPath,
    ["--no-warnings", "--experimental-strip-types", test],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    },
  );
  if (result.status !== 0) failures.push(test);
}

if (failures.length > 0) {
  process.stderr.write(
    `\n${failures.length}/${tests.length} test files failed:\n${failures
      .map((test) => `- ${test}`)
      .join("\n")}\n`,
  );
  process.exit(1);
}

process.stdout.write(`\nAll ${tests.length} test files passed.\n`);
