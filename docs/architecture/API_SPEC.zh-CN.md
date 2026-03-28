# RelayDesk API 规范

最后更新：2026-03-28

## 1. 说明

本文档记录当前已实现的 API 和后续计划中的 API，作为前后端联调和后续重构的接口基线。当前服务基于：

- 协议：HTTP + JSON
- 实时通道：WebSocket
- 鉴权方式：`Authorization: Bearer <token>`

基础地址：

- API：`http://127.0.0.1:4010`
- WebSocket：`ws://127.0.0.1:4010/ws?token=<jwt>`

## 2. 认证接口

### `POST /api/auth/register`

说明：
创建新用户并返回 JWT。

请求体：

```json
{
  "email": "demo@example.com",
  "password": "password123"
}
```

响应体：

```json
{
  "token": "jwt-token",
  "user": {
    "id": "user-id",
    "email": "demo@example.com",
    "createdAt": "2026-03-28T00:00:00.000Z"
  }
}
```

### `POST /api/auth/login`

说明：
登录并返回 JWT。

### `GET /api/auth/me`

说明：
获取当前登录用户。

## 3. 健康检查

### `GET /api/health`

响应体：

```json
{
  "ok": true,
  "service": "relaydesk-api"
}
```

## 4. 项目接口

### `GET /api/projects`

说明：
获取当前用户的项目列表。

### `POST /api/projects`

说明：
创建项目。

请求体：

```json
{
  "name": "CloudCLI Demo",
  "rootPath": "/workspace/demo",
  "providerPreferences": ["mock"]
}
```

### `GET /api/projects/:projectId/bootstrap`

说明：
获取工作台初始化数据，包括：

- 当前项目
- 项目下会话列表
- 当前活跃运行
- 当前待处理审批列表

## 5. 会话接口

### `GET /api/projects/:projectId/sessions`

说明：
获取项目下会话列表。

### `POST /api/projects/:projectId/sessions`

说明：
创建会话。

当前实现：

- `mock` 会话会使用本地占位流式回复
- `claude` 会话会通过 Anthropic Messages API 获取真实回复
- `codex` 会话会通过 OpenAI Responses API 获取真实回复
- 其他 provider 标识暂保留为占位适配

请求体：

```json
{
  "title": "会话 1",
  "provider": "codex"
}
```

### `GET /api/sessions/:sessionId/messages`

说明：
获取会话下的全部消息，按时间顺序返回。

### `POST /api/sessions/:sessionId/messages`

说明：
发送用户消息，并触发 provider 回复流。

当前实现：

- `mock`、`claude` 和 `codex` 已接通统一消息时间线
- Claude 需要配置 `ANTHROPIC_API_KEY`
- Codex 需要配置 `OPENAI_API_KEY`

请求体：

```json
{
  "content": "请给我一个重构建议"
}
```

### `POST /api/sessions/:sessionId/stop`

说明：
停止当前会话中的流式输出。

## 6. 运行接口

### `GET /api/projects/:projectId/runs/active`

说明：
获取项目下当前活跃的替身 AI Agent 运行。

### `POST /api/projects/:projectId/runs`

说明：
创建新的替身 AI Agent 运行，并进入 `waiting_human` 状态，等待人工审批。

当前实现：

- 若会话 provider 为 `claude`，审批通过后将调用 Claude 生成真实回复
- 若会话 provider 为 `codex`，审批通过后将调用 Codex 生成真实回复
- 若未配置 Claude 凭证，请求会在消息时间线中以失败结果返回

请求体：

```json
{
  "sessionId": "session-id",
  "objective": "代替我推进第一轮技术讨论",
  "constraints": "遇到风险操作必须停下"
}
```

### `POST /api/runs/:runId/stop`

说明：
停止当前运行中的替身 AI Agent。

### `POST /api/runs/:runId/takeover`

说明：
真实用户人工接管当前运行。系统会暂停替身 AI Agent，并将运行状态切换为 `paused`。

### `POST /api/runs/:runId/resume`

说明：
恢复一个已暂停的运行。系统会重新创建待审批项，并将运行状态切换回 `waiting_human`。

## 7. 审批接口

### `GET /api/runs/:runId/approvals`

说明：
获取指定运行关联的审批列表，按时间倒序返回。

### `POST /api/approvals/:approvalId/approve`

说明：
批准待处理审批，并将对应运行从 `waiting_human` 切换到 `running`。

请求体：

```json
{
  "note": "可以继续"
}
```

### `POST /api/approvals/:approvalId/reject`

说明：
拒绝待处理审批，并停止对应运行。

## 8. WebSocket 协议

### 客户端发送

当前支持：

```json
{
  "type": "subscribe",
  "channel": "session:<sessionId>"
}
```

或：

```json
{
  "type": "subscribe",
  "channel": "project:<projectId>"
}
```

### 服务端事件

#### `session.subscribed`

说明：
确认订阅成功。

#### `message.created`

说明：
新消息创建完成并落库。

#### `message.delta`

说明：
流式消息增量。

#### `message.completed`

说明：
流式消息完成。

#### `run.updated`

说明：
替身 AI Agent 的运行状态变更。

#### `approval.updated`

说明：
审批状态发生变更，例如新建待审批项、批准或拒绝。

#### `error`

说明：
WebSocket 消息格式错误或服务端订阅错误。

## 9. 文件接口

### `GET /api/projects/:projectId/files`

说明：
返回某个目录下的直接子项。通过查询参数 `path` 指定相对路径；省略时返回项目根目录。

### `GET /api/projects/:projectId/files/content`

说明：
读取文本文件内容。通过查询参数 `path` 指定文件相对路径。

当前限制：

- 仅支持文本文件
- 二进制文件会返回错误
- 路径不能越出项目根目录

### `POST /api/projects/:projectId/files/save`

说明：
保存文本文件内容。如果父目录不存在，会自动创建。

请求体：

```json
{
  "path": "notes/todo.md",
  "content": "hello workspace"
}
```

## 10. 终端接口

### `POST /api/projects/:projectId/terminal/session`

说明：
在项目根路径下创建新的终端会话，并返回会话元信息。

响应体：

```json
{
  "session": {
    "id": "terminal-session-id",
    "projectId": "project-id",
    "cwd": "/workspace/demo",
    "shell": "/bin/zsh",
    "createdAt": "2026-03-28T00:00:00.000Z"
  }
}
```

### `GET /terminal?token=<jwt>&sessionId=<terminalSessionId>`

说明：
建立终端专用 WebSocket 连接。

客户端可发送：

```json
{
  "type": "input",
  "payload": {
    "data": "ls\n"
  }
}
```

或：

```json
{
  "type": "resize",
  "payload": {
    "cols": 120,
    "rows": 32
  }
}
```

服务端会返回：

- `terminal.ready`
- `terminal.output`
- `terminal.exit`
- `terminal.error`

## 11. Git 接口

### `GET /api/projects/:projectId/git/status`

说明：
获取当前项目 Git 仓库的分支信息、ahead/behind 状态、脏状态和变更文件列表。

响应体：

```json
{
  "status": {
    "available": true,
    "rootPath": "/workspace/demo",
    "branch": "main",
    "ahead": 0,
    "behind": 0,
    "dirty": true,
    "files": [
      {
        "path": "apps/web/src/App.tsx",
        "stagedStatus": " ",
        "unstagedStatus": "M",
        "summary": "未暂存修改"
      }
    ]
  }
}
```

当前限制：

- 仅支持读取状态，不支持暂存、提交、切换分支
- 项目根目录必须是合法 Git 仓库

### `GET /api/projects/:projectId/git/diff?path=<relativePath>`

说明：
读取指定文件的 Git diff。若文件未跟踪或当前没有可展示的变更，会返回提示信息。

响应体：

```json
{
  "diff": {
    "available": true,
    "path": "apps/web/src/App.tsx",
    "diff": "diff --git a/apps/web/src/App.tsx b/apps/web/src/App.tsx\n...",
    "isUntracked": false
  }
}
```

## 12. 计划中的接口

以下接口尚未实现，但建议后续保持这一层级：

- `GET /api/runs/:runId/checkpoints`
- `POST /api/runs/:runId/restore`

## 13. 设计约束

- REST 负责创建和查询，WebSocket 负责实时事件回推
- 共享消息模型必须保持稳定
- 替身 AI Agent 和普通消息流应共用统一会话上下文
- Provider 差异应尽量被吸收到适配层，而不是暴露给页面层
