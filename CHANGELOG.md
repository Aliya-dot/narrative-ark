# 更新日志

本文件记录叙界的重要变更，格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [未发布]

### 计划

- 根据测试反馈继续完善 Windows 与 Android 客户端。

## [0.1.5] - 2026-08-02

### 新增

- Windows x64 NSIS、MSI、自动更新签名与安装/升级/卸载烟雾测试。
- Android 9+ 签名 APK/AAB 自动构建、证书指纹与产物校验。
- SQLite 本地数据仓、备份恢复、浏览器旧数据迁移和跨设备数据包。
- 应用内更新检查、连接配置与世界书/项目编辑流程。
- GitHub Actions CI、双平台发布、GitHub Pages 下载页和赞助入口。

### 安全

- AI 密钥使用系统安全存储，并保留加密兼容存储方案。
- Android 发布仅申请网络与网络状态权限，文件导入导出使用系统选择器。
- 云模型地址强制 HTTPS；局域网 HTTP 仅向私有地址范围开放。

[未发布]: https://github.com/Aliya-dot/narrative-ark/compare/v0.1.5...HEAD
[0.1.5]: https://github.com/Aliya-dot/narrative-ark/releases/tag/v0.1.5
