# 发布指南

## 1. 准备版本

1. 在 `CHANGELOG.md` 将“未发布”内容归入新版本并写入日期。
2. 同步修改 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`。
3. Android 发布还需递增 `src-tauri/tauri.conf.json` 中的 `versionCode`。
4. 运行：

```powershell
npm run release:preflight
npm run check
npm run client:typecheck
npm run client:build
```

## 2. 配置仓库 Secrets

| Secret                               | 用途                       |
| ------------------------------------ | -------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`          | Windows 自动更新签名私钥   |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 更新签名私钥密码           |
| `ANDROID_KEYSTORE_BASE64`            | Android JKS 的 Base64 内容 |
| `ANDROID_KEYSTORE_PASSWORD`          | Android KeyStore 密码      |
| `ANDROID_KEY_PASSWORD`               | Android 密钥密码           |

对象存储镜像为可选配置，变量见 [Windows 发布说明](WINDOWS_RELEASE.md)。任何私钥和密码都
不得提交到 Git。

## 3. 触发自动发布

```powershell
git tag -a v0.1.5 -m "Narrative Ark v0.1.5"
git push origin v0.1.5
```

`.github/workflows/release.yml` 会：

1. 运行 lint、类型检查与测试；
2. 在内部构建并验证 Windows 安装产物与更新签名；
3. 在 Windows runner 执行安装、升级、卸载和存档保留测试；
4. 在内部构建并验证签名 Android APK/AAB；
5. 清理草稿资源，只保留统一命名的 Windows EXE 和 Android APK；
6. 发布正式 GitHub Release，并按配置同步这两个安装包到下载镜像。

也可在 Actions 页面手动运行工作流。失败时保持 draft Release，修复后重新运行；不要把未
验证产物改成公开 Release。

## 4. 发布后检查

- 发行页仅显示 `Narrative-Ark_<版本>_Windows-x64.exe`、
  `Narrative-Ark_<版本>_Android.apk` 和 GitHub 自动生成的两个源码归档；
- 本地计算的 SHA-256 与 GitHub 资源右侧显示的摘要一致；
- Android APK 的版本号、`versionCode` 和签名证书正确；
- `CHANGELOG.md` 中的版本链接有效。
