const repository = "Aliya-dot/narrative-ark";
const api = `https://api.github.com/repos/${repository}/releases/latest`;

function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function assetLink(asset, label) {
  const link = document.createElement("a");
  link.className = "asset";
  link.href = asset.browser_download_url;
  link.innerHTML = `<span>${label}</span><small>${formatSize(asset.size)} ↓</small>`;
  return link;
}

function renderAssets(targetId, assets, selectors) {
  const target = document.getElementById(targetId);
  const matches = selectors
    .map(({ pattern, label }) => {
      const asset = assets.find((entry) => pattern.test(entry.name));
      return asset ? { asset, label } : null;
    })
    .filter(Boolean);

  if (!matches.length) return;
  target.replaceChildren(
    ...matches.map(({ asset, label }) => assetLink(asset, label)),
  );
}

fetch(api, { headers: { Accept: "application/vnd.github+json" } })
  .then((response) => {
    if (!response.ok) throw new Error(`GitHub API ${response.status}`);
    return response.json();
  })
  .then((release) => {
    const date = new Intl.DateTimeFormat("zh-CN", {
      dateStyle: "medium",
    }).format(new Date(release.published_at || release.created_at));
    document.getElementById("release-status").textContent =
      `${release.tag_name} · ${date}`;
    renderAssets("windows-assets", release.assets, [
      {
        pattern: /Narrative-Ark_.*_Windows-x64\.exe$/i,
        label: "下载 Windows x64 EXE",
      },
    ]);
    renderAssets("android-assets", release.assets, [
      {
        pattern: /Narrative-Ark_.*_Android\.apk$/i,
        label: "下载 Android APK",
      },
    ]);
  })
  .catch(() => {
    document.getElementById("release-status").textContent =
      "前往 GitHub Releases 查看可用版本";
  });
