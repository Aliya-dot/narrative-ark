import { getPlatformCapabilities } from "./capabilities";

export const AUTO_UPDATE_ENABLED_KEY =
  "narrative-ark:windows-updater:auto-check";
export const LAST_UPDATE_CHECK_KEY = "narrative-ark:windows-updater:last-check";
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export type UpdateProgress = {
  stage: "downloading" | "installing";
  downloadedBytes: number;
  totalBytes?: number;
  percent?: number;
};

export type InstallableWindowsUpdate = {
  currentVersion: string;
  version: string;
  date?: string;
  notes?: string;
  install(onProgress?: (progress: UpdateProgress) => void): Promise<void>;
  close(): Promise<void>;
};

export type WindowsUpdateCheckResult =
  | { status: "unsupported" }
  | { status: "up-to-date" }
  | { status: "available"; update: InstallableWindowsUpdate };

export function isAutoUpdateEnabled(storage: Storage) {
  return storage.getItem(AUTO_UPDATE_ENABLED_KEY) !== "false";
}

export function setAutoUpdateEnabled(storage: Storage, enabled: boolean) {
  storage.setItem(AUTO_UPDATE_ENABLED_KEY, String(enabled));
}

export function shouldRunAutomaticUpdateCheck(
  storage: Pick<Storage, "getItem">,
  now = Date.now(),
) {
  if (storage.getItem(AUTO_UPDATE_ENABLED_KEY) === "false") return false;
  const lastCheck = Number(storage.getItem(LAST_UPDATE_CHECK_KEY) || 0);
  return (
    !Number.isFinite(lastCheck) ||
    lastCheck <= 0 ||
    now - lastCheck >= UPDATE_CHECK_INTERVAL_MS
  );
}

export function recordAutomaticUpdateCheck(
  storage: Pick<Storage, "setItem">,
  now = Date.now(),
) {
  storage.setItem(LAST_UPDATE_CHECK_KEY, String(now));
}

function percentage(downloadedBytes: number, totalBytes?: number) {
  if (!totalBytes || totalBytes <= 0) return undefined;
  return Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));
}

export async function checkForWindowsUpdate(): Promise<WindowsUpdateCheckResult> {
  const runtime = getPlatformCapabilities().runtime;
  if (!runtime.native || runtime.platform !== "windows") {
    return { status: "unsupported" };
  }

  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check({ timeout: 20_000 });
  if (!update) return { status: "up-to-date" };

  return {
    status: "available",
    update: {
      currentVersion: update.currentVersion,
      version: update.version,
      date: update.date,
      notes: update.body,
      async install(onProgress) {
        let downloadedBytes = 0;
        let totalBytes: number | undefined;
        await update.downloadAndInstall(
          (event) => {
            if (event.event === "Started") {
              totalBytes = event.data.contentLength;
              onProgress?.({
                stage: "downloading",
                downloadedBytes,
                totalBytes,
                percent: percentage(downloadedBytes, totalBytes),
              });
            } else if (event.event === "Progress") {
              downloadedBytes += event.data.chunkLength;
              onProgress?.({
                stage: "downloading",
                downloadedBytes,
                totalBytes,
                percent: percentage(downloadedBytes, totalBytes),
              });
            } else {
              onProgress?.({
                stage: "installing",
                downloadedBytes,
                totalBytes,
                percent: 100,
              });
            }
          },
          { timeout: 10 * 60 * 1000 },
        );
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      },
      close() {
        return update.close();
      },
    },
  };
}
