"use client";

import { useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  checkForWindowsUpdate,
  isAutoUpdateEnabled,
  setAutoUpdateEnabled,
  type InstallableWindowsUpdate,
} from "@/lib/platform/app-updater";
import { getPlatformCapabilities } from "@/lib/platform/capabilities";

export function AppUpdateSettingsPanel() {
  const [autoCheck, setAutoCheck] = useState(true);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [available, setAvailable] = useState<InstallableWindowsUpdate>();
  const [version, setVersion] = useState<string>();
  const runtime = getPlatformCapabilities().runtime;
  const supported = runtime.native && runtime.platform === "windows";

  useEffect(() => {
    setAutoCheck(isAutoUpdateEnabled(localStorage));
    if (!supported) return;
    void import("@tauri-apps/api/app")
      .then(({ getVersion }) => getVersion())
      .then(setVersion)
      .catch(() => setVersion(undefined));
  }, [supported]);

  async function checkNow() {
    setChecking(true);
    try {
      const result = await checkForWindowsUpdate();
      if (result.status === "available") {
        setAvailable(result.update);
        toast.success(`发现新版本 ${result.update.version}`);
      } else if (result.status === "up-to-date") {
        setAvailable(undefined);
        toast.success("当前已经是最新版本");
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `检查更新失败：${error.message}`
          : "检查更新失败",
      );
    } finally {
      setChecking(false);
    }
  }

  async function installNow() {
    if (!available) return;
    setInstalling(true);
    const toastId = toast.loading("正在下载更新…");
    try {
      await available.install((progress) => {
        toast.loading(
          progress.stage === "installing"
            ? "正在安装并重启…"
            : typeof progress.percent === "number"
              ? `正在下载更新… ${progress.percent}%`
              : "正在下载更新…",
          { id: toastId },
        );
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? `更新失败：${error.message}` : "更新失败",
        { id: toastId },
      );
      setInstalling(false);
    }
  }

  return (
    <section
      className="panel mt-6 p-5 md:p-6"
      aria-labelledby="app-update-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="label">WINDOWS RELEASE</p>
          <h2 id="app-update-title" className="display mt-1 text-2xl">
            应用更新
          </h2>
          <p className="muted mt-2 text-sm leading-6">
            {supported
              ? `当前版本：${version || "读取中"}。更新包会先验证发布签名，再进行安装。`
              : "自动更新在 Windows 客户端中启用。"}
          </p>
        </div>
        {supported ? (
          <button
            className="btn"
            onClick={checkNow}
            disabled={checking || installing}
          >
            <RefreshCw className={checking ? "animate-spin" : ""} size={16} />
            {checking ? "正在检查" : "检查更新"}
          </button>
        ) : null}
      </div>

      <label className="mt-5 flex items-start gap-3 rounded-lg border border-[var(--line)] p-4">
        <input
          className="mt-1"
          type="checkbox"
          checked={autoCheck}
          onChange={(event) => {
            setAutoCheck(event.target.checked);
            setAutoUpdateEnabled(localStorage, event.target.checked);
          }}
        />
        <span>
          <b className="block text-sm">启动后自动检查更新</b>
          <span className="muted mt-1 block text-xs leading-5">
            最多每六小时检查一次；发现版本后由你确认下载安装。
          </span>
        </span>
      </label>

      {available ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[var(--panel2)] p-4">
          <div>
            <b>可更新至 {available.version}</b>
            {available.notes ? (
              <p className="muted mt-1 text-xs leading-5">{available.notes}</p>
            ) : null}
          </div>
          <button
            className="btn btn-primary"
            onClick={installNow}
            disabled={installing}
          >
            <Download size={16} />
            {installing ? "正在安装" : "下载并安装"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
