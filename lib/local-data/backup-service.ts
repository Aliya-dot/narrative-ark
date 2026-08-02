import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../platform/capabilities";

export interface LocalBackupInfo {
  id: string;
  createdAtMs: number;
  size: number;
  reason: "automatic" | "manual" | "pre-restore";
}

let automaticBackupTimer: ReturnType<typeof setTimeout> | undefined;

export function scheduleAutomaticBackup(delayMs = 5000) {
  if (!isTauriRuntime()) return;
  if (automaticBackupTimer) clearTimeout(automaticBackupTimer);
  automaticBackupTimer = setTimeout(() => {
    automaticBackupTimer = undefined;
    void invoke("local_db_create_backup", { reason: "automatic" }).catch(
      (error) => console.error("automatic SQLite backup failed", error),
    );
  }, delayMs);
}

export async function createManualBackup() {
  if (!isTauriRuntime()) {
    throw new Error("手动数据库备份仅用于桌面或 Android 客户端");
  }
  return invoke<LocalBackupInfo>("local_db_create_backup", {
    reason: "manual",
  });
}

export async function listLocalBackups() {
  if (!isTauriRuntime()) return [];
  return invoke<LocalBackupInfo[]>("local_db_list_backups");
}

export async function restoreLocalBackup(id: string) {
  if (!isTauriRuntime()) {
    throw new Error("数据库恢复仅用于桌面或 Android 客户端");
  }
  await invoke("local_db_restore_backup", { id });
}

export function cancelScheduledAutomaticBackup() {
  if (automaticBackupTimer) clearTimeout(automaticBackupTimer);
  automaticBackupTimer = undefined;
}
