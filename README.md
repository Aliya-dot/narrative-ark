# 叙界 / Narrative Ark

> AI 文字冒险创作、世界书管理、持续游玩与多存档客户端。

[![CI](https://github.com/Aliya-dot/narrative-ark/actions/workflows/ci.yml/badge.svg)](https://github.com/Aliya-dot/narrative-ark/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/Aliya-dot/narrative-ark?include_prereleases)](https://github.com/Aliya-dot/narrative-ark/releases)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)

[下载最新版](https://Aliya-dot.github.io/narrative-ark/) ·
[更新日志](CHANGELOG.md) ·
[参与贡献](CONTRIBUTING.md) ·
[安全说明](SECURITY.md) ·
[隐私说明](PRIVACY.md)

## 功能与平台

- Tauri 2 + React + Vite 客户端
- Windows 10 及以上；Android 9（API 28）及以上
- 世界书、项目、存档与设置使用本机 SQLite 保存
- 支持 `.nark-data` 整库包、`.nark` 游戏包、`.nark-world` 世界书包
- 支持本机自动备份、手动备份与恢复；当前不启用云同步
- 可连接用户自行配置的 AI 服务；密钥不写入项目导出包

## 下载与校验

安装包统一发布在 [GitHub Releases](https://github.com/Aliya-dot/narrative-ark/releases/latest)：

- Windows x64：NSIS `*-setup.exe`、MSI `*.msi`
- Android：可直接安装的签名 APK、供应用商店使用的 AAB
- 每次发布附带 SHA-256 校验清单；Windows 自动更新另有 Tauri 签名

早期 Windows 测试版尚未配置 Authenticode 证书，可能触发 SmartScreen 提示。

## 本地开发

需要 Node.js 24、npm、Rust stable。安装依赖并启动 Web 客户端：

```powershell
npm ci
npm run client:dev
```

启动 Tauri Windows 客户端：

```powershell
npm run tauri:dev
```

Android 首次初始化还需要 JDK 17、Android SDK 36、NDK 29，并配置
`ANDROID_HOME` 与 `NDK_HOME`：

```powershell
npm run tauri:android:init
npm run tauri:android:dev
```

## 验证

```powershell
npm run check
npm run client:typecheck
npm run client:build
cd src-tauri
cargo fmt --check
cargo check
cargo test --lib
```

架构、安全边界与数据策略：

- [客户端架构](docs/CLIENT_ARCHITECTURE.md)
- [本地数据系统](docs/LOCAL_DATA_SYSTEM.md)
- [Windows 发布](docs/WINDOWS_RELEASE.md)
- [Android 发布](docs/ANDROID_RELEASE.md)
- [测试矩阵与第一可交付验收](docs/TEST_MATRIX.md)

## 发布

版本号同时维护在 `package.json`、`src-tauri/Cargo.toml` 与
`src-tauri/tauri.conf.json`。推送 `v<版本>` 标签后，GitHub Actions 会运行完整
检查，构建 Windows NSIS/MSI 与 Android APK/AAB，验证签名和安装行为，最后发布
GitHub prerelease。详细流程见 [发布指南](docs/RELEASING.md)。

## 支持项目

- [爱发电：星之幻](https://ifdian.net/a/xingzhihuan)
- [下载页中的微信备用收款码](https://Aliya-dot.github.io/narrative-ark/#support)

赞助完全自愿，不影响功能、许可或贡献优先级。

## 开源许可

本项目采用 [GNU Affero General Public License v3.0 only](LICENSE)。提交贡献即表示
你同意以同一许可证发布你的贡献。
