# 叙界本地数据系统

## 范围

当前阶段采用每台设备一份本地 SQLite。Windows 与 Android 运行同一 Rust 数据层、
同一 Schema 与同一迁移序列。云账号、自动同步和 WebDAV 均不在本阶段运行路径中。

旧 Web 入口继续读取名为 `narrative-ark` 的 IndexedDB，作为旧数据导出入口。

## 数据库

原生数据库位于 Tauri 应用数据目录：

```text
narrative-ark.sqlite3
backups/
  narrative-ark_<时间戳>_<原因>.sqlite3
```

`local_records` 使用 `(table_name, id)` 复合主键保存各领域对象的 JSON Payload，
并为常用父级查询、时间排序和世界书版本排序建立独立索引。受支持的逻辑表：

1. `projects`
2. `configs`
3. `saves`
4. `drafts`
5. `exports`
6. `worldBooks`
7. `worldBookEntries`
8. `worldBookVersions`
9. `scenarios`

API Key 不属于这些表；`configs` 仅存 `credentialRef`。

## 版本迁移

SQL 迁移保存在 `src-tauri/migrations/`，Rust 组合根以递增整数版本注册。启动时：

1. 创建 `schema_migrations`。
2. 查询每个版本是否已经执行。
3. 未执行版本在独立事务中运行。
4. SQL 与迁移记录一起提交；任一步失败则回滚该版本。

新增迁移只追加文件和版本，不修改已经发布的迁移。

## IndexedDB 迁移

原生客户端首次打开空 SQLite 时，会检查当前 WebView Origin 下的旧 Dexie 数据：

- 有记录：九张逻辑表在一个 SQLite 事务中迁入。
- 无记录：写入空迁移标记，避免每次启动重复扫描。
- SQLite 已有记录：保留当前数据库，不自动覆盖。
- 浏览器 `localhost` 与 Tauri 自定义协议 Origin 不同：先在浏览器设置页导出
  `.nark-data`，再在客户端设置页合并导入。

迁移和导出都会清空旧 `configs.apiKey`；密钥需由目标设备写入系统安全存储。

## 文件迁移

| 文件          | 内容                 | 用途                              |
| ------------- | -------------------- | --------------------------------- |
| `.nark-data`  | 九张逻辑表           | 整机浏览器迁移、电脑/手机完整搬迁 |
| `.nark`       | 一个项目和一个存档   | 当前游戏在设备间继续              |
| `.json`       | 一个项目             | 单项目导入导出兼容格式            |
| `.nark-world` | 世界书、资料卡、版本 | 世界书独立迁移                    |

所有格式都是带 `format` 与 `version` 的 UTF-8 JSON Envelope。导入先校验格式、
版本和记录 ID，再在事务中写入。

## 备份与恢复

- 每次成功数据变更后启动 5 秒防抖，创建 `automatic` 快照。
- 设置页可创建 `manual` 快照。
- 恢复前创建 `pre-restore` 快照。
- 自动备份保留最近 10 份；手动及恢复前备份分别保留最近 20 份。
- 文件名必须通过单一普通路径组件校验，恢复仅从应用备份目录读取。
- 快照和恢复使用 SQLite Online Backup API，不直接复制活动中的 WAL 数据库文件。
