import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const workspace = resolve(import.meta.dirname, "..");
const requireSigning = process.argv.includes("--require-signing");

async function loadJson(path) {
  return JSON.parse(await readFile(resolve(workspace, path), "utf8"));
}

async function exists(path) {
  try {
    await access(resolve(workspace, path));
    return true;
  } catch {
    return false;
  }
}

const packageJson = await loadJson("package.json");
const tauri = await loadJson("src-tauri/tauri.conf.json");
const signing = await loadJson("release/android-signing-certificate.json");
const manifest = await readFile(
  resolve(
    workspace,
    "src-tauri/gen/android/app/src/main/AndroidManifest.xml",
  ),
  "utf8",
);
const networkSecurity = await readFile(
  resolve(
    workspace,
    "src-tauri/gen/android/app/src/main/res/xml/network_security_config.xml",
  ),
  "utf8",
);
const gradle = await readFile(
  resolve(workspace, "src-tauri/gen/android/app/build.gradle.kts"),
  "utf8",
);

if (packageJson.version !== tauri.version) {
  throw new Error("package.json and tauri.conf.json versions differ");
}
if (tauri.identifier !== signing.applicationId) {
  throw new Error("Android application ID differs from signing metadata");
}
if (tauri.bundle?.android?.minSdkVersion !== signing.minimumSdk) {
  throw new Error("Android minimum SDK differs from signing metadata");
}
const versionCode = tauri.bundle?.android?.versionCode;
if (!Number.isInteger(versionCode) || versionCode < signing.firstVersionCode) {
  throw new Error("Android versionCode is missing or below the first release");
}
for (const permission of [
  "android.permission.INTERNET",
  "android.permission.ACCESS_NETWORK_STATE",
]) {
  if (!manifest.includes(permission)) {
    throw new Error(`Android manifest is missing ${permission}`);
  }
}
if (
  !manifest.includes('android:networkSecurityConfig="@xml/network_security_config"')
) {
  throw new Error("Android network security config is not linked");
}
if (!networkSecurity.includes('cleartextTrafficPermitted="true"')) {
  throw new Error("LAN Ollama cleartext policy is missing");
}
if (
  !gradle.includes('create("release")') ||
  !gradle.includes("keystore.properties")
) {
  throw new Error("Android release signing is not wired into Gradle");
}
if (
  requireSigning &&
  (!(await exists("src-tauri/gen/android/keystore.properties")) ||
    !(await exists(".release-secrets/android/narrative-ark-release.jks")))
) {
  throw new Error("Android release signing secrets have not been prepared");
}

console.log(
  `Android release preflight passed: ${packageJson.version} (${versionCode}), minSdk ${signing.minimumSdk}.`,
);
