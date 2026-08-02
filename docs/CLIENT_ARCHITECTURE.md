# 叙界客户端架构

## 目标

- Tauri 2 + React/Vite 构建 Windows 与 Android。
- Windows 最低支持 Windows 10。
- Android 最低支持 Android 9（API 28）。
- React 功能 Module 不直接依赖 Next.js 服务端接口。
- 模型流量通过 Tauri Rust HTTP 插件。
- Windows 允许本机 Ollama；Android 允许云模型与明确配置的 RFC1918 局域网 Ollama。
- API Key 只写入 Windows Credential Manager 或 Android Keystore。

## PlatformCapabilities Seam

`lib/platform/capabilities.ts` 是组合根。功能 Module 应依赖其中的窄 Interface：

- `NetworkGateway`：浏览器 Adapter 或 `tauri-plugin-http` Rust Adapter。
- `SecretStore`：Web 环境不可用 Adapter 或 OS Keyring Adapter。
- `RuntimeCapabilities`：集中表达平台与 Ollama 能力。

业务代码不应直接导入 Tauri 插件。Tauri 插件只出现在 Adapter Implementation 中。

## 路由迁移

`client/` 是新的 Vite SPA 入口。它通过兼容 Adapter 暂时复用现有页面：

- `next/link` → React Router Link Adapter
- `next/navigation` → React Router navigation Adapter

保留现有路径语义，使用 Hash Router 避免 Tauri 静态宿主刷新动态路径时返回 404。

## 已落地的业务 Module

- 创作：`creation-workspace-storage.ts` 与 `creation-ai.ts`
- 世界书：`world-book-editor-workspace.ts`、`world-book-publish-boundary.ts`
- 游玩：`play-turn-state.ts`
- 存档：`project-save-boundary.ts`、`editor-project-save.ts`
- 模型执行：`model-execution.ts`

页面只负责交互编排，关键状态转换和写入顺序由上述 Module 与 Storage
Interface 约束。

## 模型与凭据

`lib/ai-client.ts` 直接调用 `ModelExecution`，不再访问 `/api/ai`。
`ModelExecution` 通过 `NetworkGateway` 发起模型请求；Tauri 环境使用 Rust
HTTP Adapter，Next 路由仅作为旧 Web 入口的兼容 Adapter。

`ai-config-repository.ts` 将非敏感模型配置写入统一本地数据接口，并只保存
`credentialRef`。API Key 在 Windows 写入 Credential Manager，在 Android 写入
Android Keystore。旧浏览器记录迁移到 SQLite 时会清空其中的明文密钥字段。

## 本地数据持久化

`lib/db.ts` 是兼容现有 Storage Interface 的本地数据门面：

- Windows 与 Android 原生客户端统一使用 Rust `rusqlite` Adapter。
- SQLite 文件写入 Tauri 应用数据目录，启用 WAL、busy timeout 与事务。
- Web/旧版入口保留 Dexie Adapter，仅用于兼容和导出浏览器 IndexedDB 数据。
- `src-tauri/migrations/` 保存顺序版本迁移；`schema_migrations` 记录已执行版本，
  每个版本在独立事务中提交。
- 同源旧 IndexedDB 在 SQLite 首次初始化且为空时自动迁移；不同源的浏览器数据
  通过 `.nark-data` 整库迁移包导入。
- 项目 JSON、含存档的 `.nark` 游戏包、`.nark-world` 世界书包均可独立迁移。
- 本地数据变更会触发 5 秒防抖自动备份，原生设置页支持手动备份和恢复；恢复前
  先创建 `pre-restore` 快照。
- 当前阶段没有云账号、云数据库、WebDAV 或自动同步。

## 安全规则

- 云模型只允许 HTTPS。
- Windows Ollama 只允许 loopback。
- Android Ollama 只允许明确输入的 RFC1918 地址。
- URL scope 是第二道限制，应用层 Endpoint Policy 仍必须执行。
- 客户端数据库只保存凭据引用，不保存 API Key。
- 任何迁移包、游戏包与备份 API 都不会读取系统安全存储中的 API Key。
- WebView 使用显式 CSP，模型网络能力仅通过 Tauri HTTP permission scope 开放。

## 依赖审计说明

生产依赖审计只剩 React Router 的 RSC Action CSRF 公告。叙界是 Hash Router
静态 SPA，没有启用 RSC、Action、Server Action 或 React Router 服务端运行时，
因此该入口在客户端包中不可达。React Router 保持在 7.18.1，以包含其它路由与
重定向安全修复；旧 Next 兼容入口已降为开发依赖。

## 构建环境

- Windows：Rust stable、MSVC 工具链、WebView2。
- Android：JDK 17、Android SDK、NDK、`ANDROID_HOME`、`NDK_HOME`。
- Rust Android targets：
  `aarch64-linux-android`、`armv7-linux-androideabi`、
  `i686-linux-android`、`x86_64-linux-android`。
