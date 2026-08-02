# 安全说明

## 支持范围

当前处于早期测试阶段，仅最新 GitHub Release 和 `main` 分支接收安全修复。旧测试版本
可能不会单独回补，请优先升级。

## 报告漏洞

请使用仓库的
[Private vulnerability reporting](https://github.com/Aliya-dot/narrative-ark/security/advisories/new)
提交报告。请包含：

- 受影响版本与平台；
- 可复现的最小步骤或概念验证；
- 影响范围与可能的攻击前提；
- 建议修复方案（如有）。

报告前请移除真实 API 密钥、个人存档及其他敏感数据。收到报告后，维护者会先确认接收，
再协调复现、修复和披露时间。修复发布前请避免公开漏洞细节。

## 发布验证

- 仅从项目下载页或 GitHub Releases 获取安装包。
- 对照 Release 附件中的 SHA-256 清单核验文件。
- Windows 自动更新包还必须通过 Tauri 更新签名验证。
- Android APK 必须与 `release/android-signing-certificate.json` 中的证书指纹一致。

Windows 早期测试包没有 Authenticode 代码签名；SmartScreen 声誉提示不等同于 Tauri
更新签名校验。
