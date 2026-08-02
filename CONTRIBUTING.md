# 参与贡献

感谢你帮助改进叙界。提交代码前请先搜索现有 Issue，较大的功能或数据格式变更建议先开
Issue 讨论，避免重复工作。

## 开发流程

1. Fork 仓库并从 `main` 创建短分支。
2. 使用 `npm ci` 安装锁定依赖。
3. 为行为变更补充或更新自动测试。
4. 运行以下检查：

```powershell
npm run check
npm run client:typecheck
npm run client:build
cd src-tauri
cargo fmt --check
cargo check
cargo test --lib
```

5. 提交聚焦、可审阅的 Pull Request，说明动机、用户可见变化、验证方式及界面截图。

## 提交约定

- 推荐使用 `feat:`、`fix:`、`docs:`、`test:`、`build:`、`chore:` 前缀。
- 不提交 API 密钥、签名私钥、用户存档、构建产物或个人信息。
- 数据结构或迁移变更需要说明向后兼容与回滚策略。
- UI 变更需同时检查 Windows 桌面宽度与 Android 窄屏布局。

## Issue 与 Pull Request

Bug 报告请包含复现步骤、预期/实际结果、系统版本、应用版本和已脱敏日志。安全漏洞请按
[安全说明](SECURITY.md)私下报告，不要创建公开 Issue。

提交贡献即表示你有权提交相关内容，并同意按项目的
[AGPL-3.0-only](LICENSE) 许可证发布。
