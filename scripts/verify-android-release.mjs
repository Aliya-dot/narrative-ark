import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

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

function normalizedFingerprint(value) {
  return value.replaceAll(":", "").replaceAll(/\s/g, "").toLowerCase();
}

function run(tool, args) {
  const isWindowsBatch =
    process.platform === "win32" && /\.(?:bat|cmd)$/i.test(tool);
  const batchCommand = isWindowsBatch
    ? `call "${tool}" ${args.map((value) => `"${String(value)}"`).join(" ")}`
    : "";
  const result = isWindowsBatch
    ? spawnSync(batchCommand, { encoding: "utf8", shell: true })
    : spawnSync(tool, args, { encoding: "utf8", shell: false });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (result.status !== 0) {
    throw new Error(`${basename(tool)} failed (${result.status}):\n${output}`);
  }
  return output;
}

const workspace = resolve(import.meta.dirname, "..");
const root = resolve(
  workspace,
  option(
    "root",
    "src-tauri/gen/android/app/build/outputs",
  ),
);
const output = resolve(
  workspace,
  option("output", "release-artifacts/android-release-manifest.json"),
);
const metadata = JSON.parse(
  await readFile(
    resolve(workspace, "release/android-signing-certificate.json"),
    "utf8",
  ),
);
const tauriConfig = JSON.parse(
  await readFile(resolve(workspace, "src-tauri/tauri.conf.json"), "utf8"),
);
const currentVersionCode = tauriConfig.bundle.android.versionCode;
const currentMinimumSdk = tauriConfig.bundle.android.minSdkVersion;
const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (!androidHome) throw new Error("ANDROID_HOME is required");

const buildToolVersions = await readdir(resolve(androidHome, "build-tools"));
const buildTools = buildToolVersions.sort((a, b) =>
  b.localeCompare(a, undefined, { numeric: true }),
)[0];
const extension = process.platform === "win32" ? ".bat" : "";
const apksigner = resolve(
  androidHome,
  "build-tools",
  buildTools,
  `apksigner${extension}`,
);
const aapt2 = resolve(
  androidHome,
  "build-tools",
  buildTools,
  `aapt2${process.platform === "win32" ? ".exe" : ""}`,
);
const jarsigner = resolve(
  process.env.JAVA_HOME || "",
  "bin",
  `jarsigner${process.platform === "win32" ? ".exe" : ""}`,
);

const files = await filesRecursively(root);
const apk = files.find(
  (file) => file.endsWith(".apk") && file.toLowerCase().includes("release"),
);
const aab = files.find(
  (file) => file.endsWith(".aab") && file.toLowerCase().includes("release"),
);
if (!apk) throw new Error("Signed release APK is missing");
if (!aab) throw new Error("Signed release AAB is missing");

const apkBytes = await readFile(apk);
const frontendIndex = await readFile(
  resolve(workspace, "dist-client/index.html"),
  "utf8",
);
const frontendAssets = [
  ...frontendIndex.matchAll(/(?:src|href)="\/(assets\/[^"]+)"/g),
].map((match) => match[1]);
if (frontendAssets.length === 0) {
  throw new Error("Production frontend index does not reference bundled assets");
}
for (const asset of frontendAssets) {
  if (!apkBytes.includes(Buffer.from(asset, "utf8"))) {
    throw new Error(`Release APK does not embed production asset: ${asset}`);
  }
}
const compiledFrontendAssets = (
  await filesRecursively(resolve(workspace, "dist-client/assets"))
)
  .filter((file) => /\.(?:css|js)$/i.test(file))
  .map((file) => `assets/${basename(file)}`);
for (const asset of compiledFrontendAssets) {
  if (!apkBytes.includes(Buffer.from(asset, "utf8"))) {
    throw new Error(`Release APK is missing compiled frontend chunk: ${asset}`);
  }
}

const apkVerification = run(apksigner, [
  "verify",
  "--verbose",
  "--print-certs",
  "--min-sdk-version",
  String(currentMinimumSdk),
  apk,
]);
const fingerprintMatch = apkVerification.match(
  /certificate SHA-256 digest:\s*([0-9a-f:]+)/i,
);
if (
  !fingerprintMatch ||
  normalizedFingerprint(fingerprintMatch[1]) !==
    normalizedFingerprint(metadata.certificateSha256)
) {
  throw new Error("APK signing certificate fingerprint differs from metadata");
}

run(jarsigner, ["-verify", aab]);
const badging = run(aapt2, ["dump", "badging", apk]);
for (const expected of [
  `name='${metadata.applicationId}'`,
  `versionCode='${currentVersionCode}'`,
  `minSdkVersion:'${currentMinimumSdk}'`,
  `targetSdkVersion:'${metadata.targetSdk}'`,
]) {
  if (!badging.includes(expected)) {
    throw new Error(`APK metadata is missing ${expected}`);
  }
}

const artifacts = [];
for (const file of [apk, aab]) {
  const bytes = file === apk ? apkBytes : await readFile(file);
  const info = await stat(file);
  artifacts.push({
    file: basename(file),
    sourcePath: relative(workspace, file).replaceAll("\\", "/"),
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
      applicationId: metadata.applicationId,
      versionCode: currentVersionCode,
      minimumSdk: currentMinimumSdk,
      targetSdk: metadata.targetSdk,
      certificateSha256: metadata.certificateSha256,
      artifacts,
    },
    null,
    2,
  )}\n`,
  "utf8",
);
console.log(`Verified signed Android APK and AAB with ${buildTools}.`);
console.log(output);
