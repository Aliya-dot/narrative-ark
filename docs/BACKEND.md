# 叙界本地后端

## 当前边界

- 运行方式：复用 Next.js Node 服务，不增加第二个常驻进程。
- 持久化：SQLite，默认文件为 `.data/narrative-ark.sqlite`。
- 路径覆盖：可通过 `NARRATIVE_ARK_DB_PATH` 指定其他数据库文件。
- 当前浏览器 IndexedDB 继续作为前端既有数据源，首阶段不自动搬移或删除用户数据。
- API Key 继续只保存在浏览器，不写入 SQLite。

## 已提供接口

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/backend/health` | 后端与数据库健康检查 |
| `GET` | `/api/backend/projects` | 获取项目摘要列表 |
| `POST` | `/api/backend/projects` | 新建或更新项目 |
| `GET` | `/api/backend/projects/:id` | 读取完整项目 |
| `DELETE` | `/api/backend/projects/:id` | 删除项目及其后续关联数据 |

项目写入请求：

```json
{
  "project": {
    "id": "project_id",
    "updatedAt": "2026-07-28T12:00:00.000Z"
  },
  "expectedUpdatedAt": null
}
```

更新已有项目时，将上次读取到的 `updatedAt` 放入 `expectedUpdatedAt`。版本不一致时接口返回
`409 project_version_conflict`，防止旧页面覆盖新数据。

## 数据表

schema v1 已建立：

- `projects`
- `saves`
- `world_books`
- `world_book_entries`
- `world_book_versions`
- `scenarios`

业务对象以 JSON 保存，同时把主键、归属关系、版本号和更新时间拆为可索引字段。

## 渐进迁移顺序

1. 为存档增加仓储与 API，并让一次回合的项目状态和存档在同一事务中落库。
2. 前端保存成功后执行后端影子写入；失败时保留 IndexedDB 数据并显示待同步状态。
3. 增加首次启动迁移页，先预检数量和冲突，再由用户确认复制。
4. 世界书发布切换为后端事务，保留现有版本冲突语义。
5. 完成数据校验后再将 SQLite 切换为主数据源；IndexedDB 留作离线缓存。

每一阶段都采用双读校验，后端异常不清空浏览器现有项目或存档。
