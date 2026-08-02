import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

function argumentsMap(values) {
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid argument near ${key ?? "<end>"}`);
    }
    result.set(key.slice(2), value);
  }
  return result;
}

function cleanBaseUrl(value) {
  if (!value) return "";
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error("Mirror public base URL must use HTTPS");
  }
  return url.toString().replace(/\/+$/, "");
}

const args = argumentsMap(process.argv.slice(2));
const repository =
  args.get("github-repository") || process.env.GITHUB_REPOSITORY || "";
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
  throw new Error(
    "GitHub repository must use OWNER/REPOSITORY format (--github-repository)",
  );
}

const mirrorBase = cleanBaseUrl(
  args.get("mirror-base") || process.env.MIRROR_PUBLIC_BASE_URL || "",
);
const githubEndpoint = `https://github.com/${repository}/releases/latest/download/latest.json`;
const endpoints = [
  ...(mirrorBase ? [`${mirrorBase}/narrative-ark/latest.json`] : []),
  githubEndpoint,
];
const output = resolve(
  args.get("output") || "src-tauri/tauri.release.conf.json",
);

const config = {
  bundle: {
    targets: ["nsis", "msi"],
    createUpdaterArtifacts: true,
  },
  plugins: {
    updater: {
      endpoints,
      windows: {
        installMode: "passive",
      },
    },
  },
};

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(config, null, 2)}\n`, "utf8");
console.log(`Windows release config: ${output}`);
console.log(`Updater endpoints:\n- ${endpoints.join("\n- ")}`);
