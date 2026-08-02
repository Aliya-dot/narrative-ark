# Windows x64 发布

## 产物

发布构建同时生成：

- NSIS：`*-setup.exe`
- MSI：`*.msi`
- Tauri 更新签名：`*.sig`
- GitHub Releases 更新清单：`latest.json`
- SHA-256 产物清单：`windows-x64-manifest.json`

最低系统版本为 Windows 10。安装器使用系统 WebView2；缺失或版本过低时，通过微软 bootstrapper 安装。

## 本地构建

更新签名私钥保存在 `.release-secrets/narrative-ark-updater.key`，该目录已加入 `.gitignore`。私钥需要离线备份；已经安装的客户端只接受同一密钥签发的后续更新。

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = `
  Get-Content ".release-secrets/narrative-ark-updater.key" -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = `
  Get-Content ".release-secrets/narrative-ark-updater.password" -Raw

npm run release:preflight
npm run release:build:windows
npm run release:verify:windows
```

生成位置：

```text
src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/
src-tauri/target/x86_64-pc-windows-msvc/release/bundle/msi/
release-artifacts/windows-x64-manifest.json
```

## GitHub Releases

统一发布工作流：`.github/workflows/release.yml`

发布前设置仓库 Secrets：

| Secret                               | 用途                                                         |
| ------------------------------------ | ------------------------------------------------------------ |
| `TAURI_SIGNING_PRIVATE_KEY`          | `.release-secrets/narrative-ark-updater.key` 的完整内容      |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | `.release-secrets/narrative-ark-updater.password` 的完整内容 |

将 `package.json`、`src-tauri/Cargo.toml` 和 `src-tauri/tauri.conf.json` 版本同步后，推送 `v<版本>` 标签。工作流会：

1. 执行 lint、类型检查和全部自动测试；
2. 构建 Windows x64 NSIS、MSI 和更新签名；
3. 创建 GitHub draft prerelease；
4. 在干净 Windows runner 上执行静默安装、覆盖升级、卸载和存档目录保留测试；
5. 测试通过后发布 prerelease。

## 国内下载镜像

国内镜像使用任意兼容 S3 API 的对象存储。配置以下 Secrets 后，发布工作流会自动同步安装包、签名、校验清单，并重写镜像版 `latest.json`：

| Secret                     | 示例格式                              |
| -------------------------- | ------------------------------------- |
| `MIRROR_ENDPOINT`          | `https://s3.<REGION>.<PROVIDER_HOST>` |
| `MIRROR_BUCKET`            | `<BUCKET>`                            |
| `MIRROR_ACCESS_KEY_ID`     | `<ACCESS_KEY>`                        |
| `MIRROR_SECRET_ACCESS_KEY` | `<SECRET_KEY>`                        |
| `MIRROR_PUBLIC_BASE_URL`   | `https://<DOWNLOAD_HOST>`             |

客户端优先读取国内镜像的 `narrative-ark/latest.json`，镜像返回非成功状态时继续读取 GitHub Releases。

## 安装、升级、卸载验证

本地手动执行：

```powershell
.\scripts\windows-release-smoke.ps1 `
  -CurrentInstaller "<ABSOLUTE_PATH_TO_SETUP_EXE>"
```

传入上一版安装器可执行真实跨版本升级：

```powershell
.\scripts\windows-release-smoke.ps1 `
  -PreviousInstaller "<PREVIOUS_SETUP_EXE>" `
  -CurrentInstaller "<CURRENT_SETUP_EXE>"
```

脚本验证应用能启动、升级后测试存档标记仍存在、卸载后 `%APPDATA%\com.narrativeark.client` 数据仍保留，并在结束时清理测试标记。

## 未签名测试版

早期测试版仅使用 Tauri 更新签名校验下载内容，不包含 Windows Authenticode 代码签名。通过浏览器下载时 Windows 可能显示 SmartScreen 提示。

正式版接入代码签名证书后，在 `bundle.windows` 中配置证书或 `signCommand`，GitHub 工作流继续沿用同一构建和验证步骤。
