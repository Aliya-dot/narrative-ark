"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import {
  checkForWindowsUpdate,
  recordAutomaticUpdateCheck,
  shouldRunAutomaticUpdateCheck,
  type InstallableWindowsUpdate,
} from "@/lib/platform/app-updater";

function progressLabel(percent?: number) {
  return typeof percent === "number"
    ? `正在下载更新… ${percent}%`
    : "正在下载更新…";
}

async function installUpdate(update: InstallableWindowsUpdate) {
  const toastId = toast.loading("正在准备更新…");
  try {
    await update.install((progress) => {
      toast.loading(
        progress.stage === "installing"
          ? "下载完成，正在安装并重启…"
          : progressLabel(progress.percent),
        { id: toastId },
      );
    });
  } catch (error) {
    toast.error(
      error instanceof Error ? `更新失败：${error.message}` : "更新失败",
      { id: toastId },
    );
  }
}

export function AppUpdateController() {
  useEffect(() => {
    if (!shouldRunAutomaticUpdateCheck(localStorage)) return;
    recordAutomaticUpdateCheck(localStorage);

    void checkForWindowsUpdate()
      .then((result) => {
        if (result.status !== "available") return;
        toast.info(`发现叙界 ${result.update.version}`, {
          description: result.update.notes || "新版本已经可以下载安装。",
          duration: 30_000,
          action: {
            label: "下载并安装",
            onClick: () => void installUpdate(result.update),
          },
          cancel: {
            label: "稍后",
            onClick: () => void result.update.close(),
          },
        });
      })
      .catch((error) => {
        console.warn("automatic update check failed", error);
      });
  }, []);

  return null;
}
