# RelayDesk API 规范

最后更新：2026-03-29

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

### `GET /api/projects/discovery`

说明：
扫描本机工作区与 provider 目录，返回可导入项目以及已关联的 RelayDesk 项目。

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
- 最近一条运行
- 当前待处理审批列表

当前实现：

- 会在 bootstrap 时自动同步发现到的 CLI 历史会话
- 当前已支持 Claude / Codex / Gemini 的历史会话导入

## 5. 会话接口

### `GET /api/projects/:projectId/sessions`

说明：
获取项目下会话列表。

### `POST /api/projects/:projectId/sessions`

说明：
创建会话。

当前实现：

- `mock` 会话会使用本地占位流式回复
- `claude`、`codex` 和 `gemini` 会话支持 RelayDesk 新建会话与导入 CLI 会话两种入口
- 对导入的 CLI 会话，消息发送会优先走本地 CLI session bridge
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

- `mock`、`claude`、`codex` 和 `gemini` 已接通统一消息时间线
- Claude 需要配置 `ANTHROPIC_API_KEY`
- Codex 需要配置 `OPENAI_API_KEY`
- Gemini 需要配置 `GEMINI_API_KEY`
- 对导入的 CLI 会话会尝试直接恢复 provider 原生 session 并继续执行

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
- 若会话 provider 为 `gemini`，审批通过后将调用 Gemini 生成真实回复
- 若未配置对应 provider 凭证，请求会在消息时间线中以失败结果返回

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

### `GET /api/runs/:runId/audit-events`

说明：
获取指定运行的最近审计事件列表，用于追踪创建、审批、接管、停止、完成等关键节点。

### `GET /api/runs/:runId/checkpoints`

说明：
获取指定运行的最近检查点列表，用于后续恢复和运行回放。

### `POST /api/runs/:runId/restore`

说明：
从指定检查点恢复一条已暂停、已停止、已完成或失败的运行。当前实现会为该运行重新创建待审批项，并将状态切换回 `waiting_human`。

请求体：

```json
{
  "checkpointId": "checkpoint-id"
}
```

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

## 8. 设置接口

### `GET /api/projects/:projectId/settings`

说明：
读取当前项目的本地 CLI 配置摘要，包括 provider 状态、MCP server、工具权限与配置来源。

### `POST /api/projects/:projectId/settings/providers/:provider`

说明：
保存指定 provider 的配置并写回本地 CLI 配置目录。

当前实现：

- 已支持 `claude`
- 已支持 `codex`
- 已支持 `gemini`
- `cursor` 当前仍为只读摘要

## 9. 插件接口

### `GET /api/projects/:projectId/plugins/catalog`

说明：
获取当前项目可安装的插件目录，包含内建插件和项目内 `.relaydesk/plugins/*.json` 本地插件。

### `GET /api/projects/:projectId/plugins`

说明：
获取项目内已安装插件列表。

### `POST /api/projects/:projectId/plugins/install`

说明：
安装或重新启用一个插件。

当前支持：

- 通过 `pluginId` 安装 built-in / 项目内 catalog 插件
- 通过 `sourceType=local` + `sourceRef` 安装本地路径插件
- 通过 `sourceType=git` + `sourceRef` + 可选 `sourceVersion` 安装 git source 插件

### `POST /api/projects/:projectId/plugins/:pluginId/state`

说明：
更新插件启停状态。

### `GET /api/projects/:projectId/plugins/:pluginId/context`

说明：
获取插件宿主上下文，包括项目、会话、运行和审批摘要。

### `GET /api/projects/:projectId/plugins/:pluginId/frontend/module`

说明：
获取已安装插件的前端 bundle 源码、entry 路径、完整性摘要和宿主 API 版本。

当前实现：

- 仅对 `local_bundle / git_bundle` 插件开放
- 返回 `integrity=sha256-...`，供前端 runtime 做加载前校验
- 返回 `hostApiVersion`，供前端 runtime 做 API 兼容性检查

### `POST /api/projects/:projectId/plugins/:pluginId/actions/:actionId/execute`

说明：
执行插件声明的受控动作。

### `GET /api/projects/:projectId/plugins/:pluginId/history`

说明：
返回指定插件最近的动作 / RPC 执行历史。

### `POST /api/projects/:projectId/plugins/:pluginId/rpc/:rpcMethodId/execute`

说明：
执行插件声明的后端 RPC 方法。

当前实现：

- 插件安装源已支持 built-in / local / git
- 插件动作已切到统一权限模型，兼容旧受控动作
- 插件可声明后端 RPC 方法并读取宿主上下文、任务看板、审计事件等能力
- 每次动作 / RPC 调用都会写入项目级审计事件和插件执行历史

## 10. 任务接口

### `GET /api/projects/:projectId/tasks`

说明：
返回项目任务看板摘要，包括：

- 项目级文档引用
- TaskMaster 任务文件扫描结果
- 任务状态统计
- 当前任务列表、绑定的 session / run 与任务时间线

### `PATCH /api/projects/:projectId/tasks/:taskId`

说明：
显式更新 TaskMaster 任务的状态、摘要、备注、阻塞原因和绑定信息，并回写到本地任务文件。

### `POST /api/projects/:projectId/tasks/sync`

说明：
显式重新读取本地任务文件，返回最新任务看板。

### `POST /api/projects/:projectId/tasks/:taskId/start-run`

说明：
从指定任务直接发起替身运行，并把当前 session / run 绑定回 TaskMaster 文件。

当前实现：

- 优先读取本地 TaskMaster 文件
- 若未发现任务文件，仍会返回项目文档基线
- 当前仍以 TaskMaster 文件为事实源，不额外引入 MongoDB 任务持久化

## 11. WebSocket 协议

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

- 项目根目录必须是合法 Git 仓库
- 当前仅支持本地暂存、提交和分支切换/创建，尚未支持 pull、push、回滚和远程分支管理

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

### `GET /api/projects/:projectId/git/branches`

说明：
获取当前仓库的本地分支列表以及当前所在分支。

### `POST /api/projects/:projectId/git/stage`

说明：
暂存一组文件改动。

请求体：

```json
{
  "paths": ["apps/web/src/App.tsx", "README.md"]
}
```

### `POST /api/projects/:projectId/git/unstage`

说明：
取消暂存一组文件改动。

### `POST /api/projects/:projectId/git/commit`

说明：
基于当前暂存区创建一次本地提交。

请求体：

```json
{
  "message": "feat: add git workspace write actions"
}
```

### `POST /api/projects/:projectId/git/checkout`

说明：
切换已有分支，或创建并切换到新分支。

请求体：

```json
{
  "name": "feature/git-write",
  "create": true
}
```

## 12. 计划中的接口

以下接口尚未实现，但建议后续保持这一层级：

- 暂无新增计划接口

## 13. 设计约束

- REST 负责创建和查询，WebSocket 负责实时事件回推
- 共享消息模型必须保持稳定
- 替身 AI Agent 和普通消息流应共用统一会话上下文
- Provider 差异应尽量被吸收到适配层，而不是暴露给页面层
