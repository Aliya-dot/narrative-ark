"use client";

import { isTauriRuntime } from "./capabilities";

function browserDownload(data: BlobPart, fileName: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([data], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function savePortableText(
  fileName: string,
  contents: string,
  options: {
    title?: string;
    extensions?: string[];
    mimeType?: string;
  } = {},
) {
  if (!isTauriRuntime()) {
    browserDownload(
      contents,
      fileName,
      options.mimeType ?? "application/json;charset=utf-8",
    );
    return fileName;
  }

  const [{ save }, { writeTextFile }] = await Promise.all([
    import("@tauri-apps/plugin-dialog"),
    import("@tauri-apps/plugin-fs"),
  ]);
  const extensions = options.extensions ?? [
    fileName.split(".").pop() ?? "json",
  ];
  const path = await save({
    title: options.title,
    defaultPath: fileName,
    filters: [{ name: "叙界文件", extensions }],
  });
  if (!path) return null;
  await writeTextFile(path, contents);
  return path;
}

export async function savePortableBytes(
  fileName: string,
  contents: Uint8Array,
  options: {
    title?: string;
    extensions?: string[];
    mimeType?: string;
  } = {},
) {
  if (!isTauriRuntime()) {
    const copy = new Uint8Array(contents.byteLength);
    copy.set(contents);
    browserDownload(
      copy.buffer,
      fileName,
      options.mimeType ?? "application/octet-stream",
    );
    return fileName;
  }

  const [{ save }, { writeFile }] = await Promise.all([
    import("@tauri-apps/plugin-dialog"),
    import("@tauri-apps/plugin-fs"),
  ]);
  const extensions = options.extensions ?? [fileName.split(".").pop() ?? "bin"];
  const path = await save({
    title: options.title,
    defaultPath: fileName,
    filters: [{ name: "叙界文件", extensions }],
  });
  if (!path) return null;
  await writeFile(path, contents);
  return path;
}

export async function openPortableText(options: {
  title?: string;
  extensions: string[];
}) {
  if (!isTauriRuntime()) return null;
  const [{ open }, { readTextFile }] = await Promise.all([
    import("@tauri-apps/plugin-dialog"),
    import("@tauri-apps/plugin-fs"),
  ]);
  const path = await open({
    title: options.title,
    multiple: false,
    directory: false,
    filters: [{ name: "叙界文件", extensions: options.extensions }],
  });
  if (!path) return null;
  return {
    path,
    text: await readTextFile(path),
  };
}
