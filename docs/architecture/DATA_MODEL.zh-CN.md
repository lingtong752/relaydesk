# RelayDesk 数据模型

最后更新：2026-03-29

## 1. 说明

当前项目使用 MongoDB 作为主业务数据库。本文档记录当前集合、字段职责、索引建议和后续扩展方向。

## 2. 设计原则

- MongoDB 负责业务状态、运行轨迹和审计数据
- 项目源码和文件内容仍保留在文件系统
- 数据模型优先围绕 `projectId`、`sessionId`、`runId` 设计
- 消息和运行状态要支持可追溯和后续重放

## 3. 当前集合

### `users`

字段：

- `_id`
- `email`
- `passwordHash`
- `createdAt`

索引：

- `email` 唯一索引

### `projects`

字段：

- `_id`
- `ownerId`
- `name`
- `rootPath`
- `providerPreferences`
- `createdAt`
- `updatedAt`

索引：

- `ownerId + rootPath` 唯一索引

### `sessions`

字段：

- `_id`
- `projectId`
- `provider`
- `title`
- `status`
- `createdAt`
- `updatedAt`
- `lastMessageAt`

索引：

- `projectId + updatedAt`

### `messages`

字段：

- `_id`
- `sessionId`
- `projectId`
- `role`
- `senderType`
- `provider`
- `content`
- `status`
- `createdAt`
- `updatedAt`

索引：

- `sessionId + createdAt`

### `runs`

字段：

- `_id`
- `projectId`
- `sessionId`
- `provider`
- `objective`
- `constraints`
- `status`
- `startedAt`
- `updatedAt`
- `stoppedAt`

索引：

- `projectId + status + startedAt`

### `approvals`

字段：

- `_id`
- `runId`
- `status`
- `reason`
- `createdAt`
- `updatedAt`

说明：
当前集合已接入运行审批链路。

## 4. 当前状态与缺口

已落地：

- `users`
- `projects`
- `sessions`
- `messages`
- `runs`
- `approvals`
- `audit_events`
- `run_checkpoints`
- `plugin_installations`

尚未落地：

- `terminal_sessions`
- `tasks`
- `notifications`

## 5. 核心集合说明

### `audit_events`

用途：

- 记录启动运行、停止运行、人工接管、审批处理、Provider 调用等关键事件

建议字段：

- `_id`
- `projectId`
- `sessionId`
- `runId`
- `eventType`
- `actorType`
- `payload`
- `createdAt`

当前实现补充：

- `sessionId` 和 `runId` 当前允许为空，用于承接插件动作等项目级审计事件

### `terminal_sessions`

用途：

- 记录项目终端连接状态、启动目录和保活信息

### `plugin_installations`

用途：

- 记录插件安装源、版本、启停状态和宿主上下文

当前实现补充：

- 当前已作为 MongoDB 集合落地
- 插件动作声明也会随安装记录一起存储，供插件运行时消费

### `tasks`

用途：

- 记录项目任务、状态、优先级、来源 PRD

当前实现补充：

- 当前任务工作台优先从文件系统聚合 TaskMaster 任务与项目文档引用
- 任务实体尚未作为 MongoDB 持久化集合落地

### `run_checkpoints`

用途：

- 为替身 AI Agent 提供停止后恢复和运行重放能力

## 6. 建议的关系视图

- 一个 `user` 可以拥有多个 `projects`
- 一个 `project` 可以拥有多个 `sessions`
- 一个 `session` 可以拥有多条 `messages`
- 一个 `project` 可以拥有多条 `runs`
- 一条 `run` 可以关联多个 `approvals`
- 当前一条 `run` 已可关联多个 `audit_events` 和 `run_checkpoints`
- 一个 `project` 当前可以关联多个 `plugin_installations`
- 当前任务看板由 `project` + 文档文件 + TaskMaster 文件聚合生成，而不是直接落库

## 7. 演进建议

- 把消息内容逐步演进为 `parts` 结构，以支持文本、文件引用、工具结果、多模态内容
- 把替身 AI Agent 的运行状态从简单状态字段演进为事件流
- 对高频查询集合增加按时间和项目维度的复合索引
- 在 Provider 接入增多后，为运行和消息增加更明确的 `providerMetadata`
