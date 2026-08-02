"use client";

import { useEffect, useState } from "react";
import {
  ArchiveRestore,
  Database,
  Download,
  RefreshCw,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common";
import { getLocalDataBackend } from "@/lib/db";
import {
  createManualBackup,
  listLocalBackups,
  restoreLocalBackup,
  scheduleAutomaticBackup,
  type LocalBackupInfo,
} from "@/lib/local-data/backup-service";
import {
  createLocalDataTransfer,
  importLocalDataTransfer,
  parseLocalDataTransfer,
} from "@/lib/local-data/transfer";
import { isTauriRuntime } from "@/lib/platform/capabilities";
import {
  openPortableText,
  savePortableText,
} from "@/lib/platform/portable-files";

export function LocalDataSettingsPanel() {
  const [backups, setBackups] = useState<LocalBackupInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [restoreId, setRestoreId] = useState<string>();
  const nativeRuntime = isTauriRuntime();

  useEffect(() => {
    void listLocalBackups().then(setBackups);
  }, []);

  async function exportLocalData() {
    setBusy(true);
    try {
      const backend = await getLocalDataBackend();
      const bundle = await createLocalDataTransfer(backend);
      const stamp = new Date().toISOString().slice(0, 10);
      const saved = await savePortableText(
        `叙界-本地数据-${stamp}.nark-data`,
        JSON.stringify(bundle, null, 2),
        {
          title: "导出叙界本地数据",
          extensions: ["nark-data", "json"],
        },
      );
      if (saved) toast.success("本地数据包已导出；API Key 未写入文件");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导出失败");
    } finally {
      setBusy(false);
    }
  }

  async function importLocalDataText(text: string) {
    setBusy(true);
    try {
      const bundle = parseLocalDataTransfer(text);
      const backend = await getLocalDataBackend();
      const count = await importLocalDataTransfer(backend, bundle);
      if (backend.kind === "sqlite") scheduleAutomaticBackup(0);
      toast.success(`已合并导入 ${count} 条本地记录，API Key 需在本机设置`);
      setBackups(await listLocalBackups());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导入失败");
    } finally {
      setBusy(false);
    }
  }

  async function chooseLocalDataFile() {
    try {
      const selected = await openPortableText({
        title: "导入叙界本地数据",
        extensions: ["nark-data", "json"],
      });
      if (selected) await importLocalDataText(selected.text);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "读取文件失败");
    }
  }

  async function backupNow() {
    setBusy(true);
    try {
      await createManualBackup();
      setBackups(await listLocalBackups());
      toast.success("SQLite 手动备份已创建");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "备份失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="panel mt-8 p-5 md:p-8">
        <div className="flex items-start gap-3 border-b border-[var(--line)] pb-5">
          <Database className="gold mt-0.5 shrink-0" size={20} />
          <div>
            <h2 className="display text-2xl">本地数据与备份</h2>
            <p className="muted mt-2 text-sm leading-6">
              {nativeRuntime
                ? "当前使用本机 SQLite。Windows 与 Android 共用同一套数据结构。"
                : "当前为浏览器 IndexedDB 迁移入口；导出后可在 Windows 或 Android 客户端导入。"}
              暂不连接云端账号，也不执行自动同步。
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={exportLocalData}
          >
            <Download size={16} />
            导出整库迁移包
          </button>
          {nativeRuntime ? (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={chooseLocalDataFile}
            >
              <Upload size={16} />
              导入迁移包
            </button>
          ) : (
            <label className="btn cursor-pointer">
              <Upload size={16} />
              导入迁移包
              <input
                className="sr-only"
                type="file"
                accept=".nark-data,.json,application/json"
                disabled={busy}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) await importLocalDataText(await file.text());
                }}
              />
            </label>
          )}
          {nativeRuntime && (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={backupNow}
            >
              <RefreshCw size={16} />
              立即备份
            </button>
          )}
        </div>

        <p className="muted mt-4 text-xs leading-5">
          迁移包包含项目、存档、世界书、草稿和导出记录；API Key
          始终留在设备系统安全存储。设备间先使用 .nark-data
          文件或项目游戏包迁移。
        </p>

        {nativeRuntime && (
          <div className="mt-6 border-t border-[var(--line)] pt-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">本机 SQLite 备份</h3>
              <span className="muted text-xs">
                数据变更后自动延迟备份，保留最近版本
              </span>
            </div>
            {backups.length === 0 ? (
              <p className="muted mt-3 text-sm">尚无备份。</p>
            ) : (
              <div className="mt-3 grid gap-2">
                {backups.slice(0, 8).map((backup) => (
                  <div
                    key={backup.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
                  >
                    <div>
                      <span>
                        {new Date(backup.createdAtMs).toLocaleString()}
                      </span>
                      <span className="muted ml-2 text-xs">
                        {backup.reason === "automatic"
                          ? "自动"
                          : backup.reason === "manual"
                            ? "手动"
                            : "恢复前"}
                        {" · "}
                        {Math.max(1, Math.round(backup.size / 1024))} KB
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn"
                      disabled={busy}
                      onClick={() => setRestoreId(backup.id)}
                    >
                      <ArchiveRestore size={15} />
                      恢复
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(restoreId)}
        title="恢复这个 SQLite 备份？"
        description="恢复前会先自动保存当前数据库；恢复完成后应用将刷新并重新载入本地数据。"
        onCancel={() => setRestoreId(undefined)}
        onConfirm={async () => {
          if (!restoreId) return;
          setBusy(true);
          try {
            await restoreLocalBackup(restoreId);
            toast.success("备份已恢复，正在重新载入");
            window.location.reload();
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "恢复失败");
            setBusy(false);
            setRestoreId(undefined);
          }
        }}
      />
    </>
  );
}
