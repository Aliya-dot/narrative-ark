import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

const workspace = resolve(import.meta.dirname, "..");
const secretRoot = resolve(workspace, ".release-secrets/android");
const keystorePath = resolve(secretRoot, "narrative-ark-release.jks");
const passwordPath = resolve(secretRoot, "narrative-ark-release.password");
const propertiesPath = resolve(
  workspace,
  "src-tauri/gen/android/keystore.properties",
);
const generatedKeystorePath = resolve(
  workspace,
  "src-tauri/gen/android/.signing/narrative-ark-release.jks",
);

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function requireSingleLine(name, value) {
  const normalized = value?.trim();
  if (!normalized || /[\r\n]/.test(normalized)) {
    throw new Error(`${name} must be a non-empty single-line value`);
  }
  return normalized;
}

await mkdir(secretRoot, { recursive: true });

if (process.env.ANDROID_KEYSTORE_BASE64) {
  const bytes = Buffer.from(process.env.ANDROID_KEYSTORE_BASE64, "base64");
  if (bytes.length < 1_000) {
    throw new Error("ANDROID_KEYSTORE_BASE64 did not decode to a keystore");
  }
  await writeFile(keystorePath, bytes);
}

if (!(await exists(keystorePath))) {
  throw new Error(
    "Android release keystore is missing from .release-secrets/android",
  );
}

const storePassword = requireSingleLine(
  "ANDROID_KEYSTORE_PASSWORD",
  process.env.ANDROID_KEYSTORE_PASSWORD ||
    ((await exists(passwordPath))
      ? await readFile(passwordPath, "utf8")
      : undefined),
);
const keyPassword = requireSingleLine(
  "ANDROID_KEY_PASSWORD",
  process.env.ANDROID_KEY_PASSWORD || storePassword,
);
const keyAlias = requireSingleLine(
  "ANDROID_KEY_ALIAS",
  process.env.ANDROID_KEY_ALIAS || "narrative-ark-release",
);

if (process.env.ANDROID_KEYSTORE_PASSWORD) {
  await writeFile(passwordPath, storePassword, "utf8");
}

await mkdir(dirname(generatedKeystorePath), { recursive: true });
await copyFile(keystorePath, generatedKeystorePath);

const properties = [
  `storePassword=${storePassword}`,
  `keyPassword=${keyPassword}`,
  `keyAlias=${keyAlias}`,
  "storeFile=.signing/narrative-ark-release.jks",
  "",
].join("\n");

await mkdir(dirname(propertiesPath), { recursive: true });
await writeFile(propertiesPath, properties, "utf8");

console.log(
  `Android signing properties prepared: ${relative(workspace, propertiesPath)}`,
);
console.log(`Keystore alias: ${keyAlias}`);
