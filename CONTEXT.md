# 叙界 / Narrative Ark — Domain Context

## Product

叙界是一套 AI 文字冒险创作、世界书管理、持续游玩和多存档工具。Windows 与
Android 客户端由同一套 React 代码构建。

## Ubiquitous Language

- **Project**：一部可游玩的文字冒险，包含世界、角色、规则、故事和主持提示词。
- **Creation Workspace**：尚未生成完整 Project 的结构化创作草稿。
- **World Book**：可绑定到 Project 的版本化设定集合。
- **Turn**：一次玩家行动及模型返回的叙事、选项和状态补丁。
- **Save**：某个 Project 的独立运行状态与历史。
- **Model Profile**：服务商、Base URL、模型名和生成参数等非敏感配置。
- **Credential Ref**：指向系统安全存储中 API Key 的稳定引用。
- **Platform Capabilities**：业务 Module 可使用的平台能力组合根。
- **Network Gateway**：模型请求使用的窄网络 Interface；Tauri Implementation
  通过 Rust HTTP 插件执行。
- **Local Data Gateway**：业务 Module 所依赖的持久化 Seam；原生 Implementation
  为 SQLite，旧 Web 入口 Implementation 为 Dexie。
- **Local Data Transfer**：包含项目、存档、世界书和草稿等非敏感记录的
  `.nark-data` 设备迁移包。
- **Game Package**：包含 Project 与一个 Save 的 `.nark` 文件。
- **Local Backup**：由 SQLite Online Backup API 创建的本机可恢复快照。
- **Model Execution**：执行九类 AI 操作、校验结果并统一错误语义的深 Module。

## Invariants

- 客户端业务代码不调用 Next.js 服务端 API。
- Tauri 插件只在 Platform Adapter 内导入。
- 原生客户端数据库不保存 API Key 明文。
- Windows 与 Android 使用相同 SQLite Schema 和迁移序列。
- 数据恢复前必须先创建当前数据库快照。
- 本阶段不建立云账号、云同步或 WebDAV 通道。
- Windows Ollama 仅允许 loopback；Android Ollama 仅允许 RFC1918 局域网地址。
- 云模型端点使用 HTTPS。
- 业务状态转换先校验再提交，失败不得写入部分结果。
