import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

async function filesRecursively(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesRecursively(path)));
    else files.push(path);
  }
  return files;
}

const rootIndex = process.argv.indexOf("--root");
const outputIndex = process.argv.indexOf("--output");
const root = resolve(
  rootIndex >= 0
    ? process.argv[rootIndex + 1]
    : "src-tauri/target/release/bundle",
);
const output = resolve(
  outputIndex >= 0
    ? process.argv[outputIndex + 1]
    : "release-artifacts/windows-x64-manifest.json",
);
const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const versionMarker = `_${packageJson.version}_`;
const files = await filesRecursively(root);
const installers = files.filter(
  (file) =>
    basename(file).includes(versionMarker) &&
    (file.endsWith("-setup.exe") || file.endsWith(".msi")),
);

const nsisInstallers = installers.filter((file) => file.endsWith("-setup.exe"));
const msiInstallers = installers.filter((file) => file.endsWith(".msi"));
if (nsisInstallers.length !== 1) {
  throw new Error("NSIS setup executable is missing");
}
if (msiInstallers.length !== 1) {
  throw new Error("MSI installer is missing");
}
const signatures = installers.map((file) => `${file}.sig`);
for (const signature of signatures) {
  if (!files.includes(signature)) {
    throw new Error(
      `Updater signature is missing for ${basename(signature, ".sig")}`,
    );
  }
}

const artifacts = [];
for (const file of [...installers, ...signatures].sort()) {
  const bytes = await readFile(file);
  const info = await stat(file);
  artifacts.push({
    file: basename(file),
    relativePath: file.slice(root.length + 1).replaceAll("\\", "/"),
    size: info.size,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}

await mkdir(dirname(output), { recursive: true });
await writeFile(
  output,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      target: "windows-x86_64",
      version: packageJson.version,
      artifacts,
    },
    null,
    2,
  )}\n`,
  "utf8",
);
console.log(`Verified ${artifacts.length} Windows release artifacts.`);
console.log(output);
