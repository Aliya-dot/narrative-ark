import { isTauriRuntime } from "./capabilities";

export async function isAppFullscreen() {
  if (isTauriRuntime()) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    return getCurrentWindow().isFullscreen();
  }
  return Boolean(document.fullscreenElement);
}

export async function setAppFullscreen(fullscreen: boolean) {
  if (isTauriRuntime()) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setFullscreen(fullscreen);
    return fullscreen;
  }
  if (fullscreen && !document.fullscreenElement) {
    await document.documentElement.requestFullscreen();
  } else if (!fullscreen && document.fullscreenElement) {
    await document.exitFullscreen();
  }
  return Boolean(document.fullscreenElement);
}

export async function toggleAppFullscreen() {
  return setAppFullscreen(!(await isAppFullscreen()));
}
