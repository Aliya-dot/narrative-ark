# Android 发布

## 发布目标

- Application ID：`com.narrativeark.client`
- 最低版本：Android 9 / API 28
- 编译与目标版本：API 36
- 首发格式：签名通用 APK，可直接下载安装
- 商店格式：签名 AAB
- CPU 架构：ARM64 与 ARMv7
- 当前版本：`0.1.5`
- 当前 `versionCode`：`1007`（Android KeyStore 失败关闭、旧加密凭据只读迁移与 API 成功态修正版）

原生工程位于 `src-tauri/gen/android/`。项目只申请网络访问和网络状态权限，不申请传统的外部存储权限；项目包、存档和世界书通过系统文件选择器导入导出。

## 网络安全策略

配置文件：

```text
src-tauri/gen/android/app/src/main/res/xml/network_security_config.xml
```

云模型地址由应用层强制使用 HTTPS。为了支持用户输入的局域网 Ollama 地址，Android 网络层允许 HTTP，但 Tauri HTTP capability 和 URL 校验只放行 RFC1918 局域网地址：

- `10.0.0.0/8`
- `172.16.0.0/12`
- `192.168.0.0/16`

发布构建仅信任系统 CA；用户安装的 CA 只在 debug 构建中额外信任。

## 发布签名

密钥：

```text
.release-secrets/android/narrative-ark-release.jks
```

密钥别名：`narrative-ark-release`

证书 SHA-256：

```text
44:18:8F:F6:D1:72:2D:BF:11:44:5B:B7:04:1E:99:CC:5F:88:EA:93:D2:7D:FA:4F:EB:83:EE:BF:80:77:43:51
```

公开指纹记录在 `release/android-signing-certificate.json`。密钥、密码和 `keystore.properties` 均由 Git 忽略。

本地准备签名：

```powershell
npm run android:signing:prepare
npm run release:preflight:android
```

## 本地构建

为当前 PowerShell 设置 Android SDK：

```powershell
$env:ANDROID_HOME = (Resolve-Path ".android-sdk").Path
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:NDK_HOME = Join-Path $env:ANDROID_HOME "ndk/29.0.14206865"
$env:Path = "C:\Users\35442\.cargo\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
```

构建并验证：

```powershell
npm run release:build:android
npm run release:verify:android
```

仓库路径包含中文时，Windows 使用经过实机验证的 ASCII 临时构建流程：

```powershell
npm run release:build:android:windows
npm run release:verify:android
```

该流程会复用 `%LOCALAPPDATA%\NarrativeArk\android-build` 下的 SDK/NDK 与
Cargo 缓存，在纯 ASCII 临时工程中完成 Kotlin、aapt2、R8 和签名阶段。

发布产物位于：

```text
src-tauri/gen/android/app/build/outputs/apk/
src-tauri/gen/android/app/build/outputs/bundle/
release-artifacts/android-release-manifest.json
```

本次已验证成品位于 `release-artifacts/android/`，其中包含可直接安装的 APK、
应用商店使用的 AAB 和 `SHA256SUMS.txt`。

## GitHub Releases

统一工作流：`.github/workflows/release.yml`

需要配置：

| Secret                      | 内容                          |
| --------------------------- | ----------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | JKS 文件的 Base64 内容        |
| `ANDROID_KEYSTORE_PASSWORD` | JKS 密码                      |
| `ANDROID_KEY_PASSWORD`      | 密钥密码；当前与 JKS 密码相同 |

Windows 与 Android 全部验证通过后，工作流才发布 prerelease。首发页面直接提供 APK，同时附带 AAB 供后续 Google Play 或国内应用商店使用；国内下载镜像会同步 APK、AAB 和校验清单。

## 升级规则

每个后续 Android 版本必须同时满足：

1. `applicationId` 始终为 `com.narrativeark.client`；
2. 始终使用同一个 `narrative-ark-release.jks`；
3. `versionCode` 严格递增；
4. `version` 使用更高的语义版本；
5. 发布前用 `apksigner` 验证证书 SHA-256 与公开指纹一致。

直接下载 APK 的用户安装新版 APK 即可覆盖升级，本地 SQLite 数据目录不会随应用包覆盖。进入 Google Play 后，可启用 Play App Signing，并将当前密钥作为上传密钥。

## 离线备份

已生成三个恢复包：

```text
.release-secrets/android/offline-backups/Narrative-Ark-Android-Key-Backup-A.zip
.release-secrets/android/offline-backups/Narrative-Ark-Android-Key-Backup-B.zip
.release-secrets/android/offline-backups/Narrative-Ark-Android-Key-Backup-C.zip
```

备份校验记录位于 `release/android-key-backup-manifest.json`。

每个包都包含 JKS、证书、恢复凭据、恢复说明和文件 SHA-256。将 A/B/C 分别复制到三块独立、加密、平时断网保存的介质，并至少在一个异地位置保存。复制完成后再次计算 ZIP SHA-256，与本地记录核对。
