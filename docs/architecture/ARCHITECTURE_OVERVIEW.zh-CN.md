# RelayDesk 架构总览

最后更新：2026-03-28

## 1. 总体结构

RelayDesk 采用前后端分离的模块化单体结构：

- `apps/web`
  React + Vite 前端应用
- `apps/api`
  Fastify + WebSocket API 服务
- `packages/shared`
  前后端共享的类型、消息协议和角色模型

## 2. 数据流

1. 用户通过 Web 登录
2. API 基于 JWT 返回认证结果
3. 用户创建项目和会话
4. 普通消息通过 REST 提交
5. Provider 或替身 AI Agent 的流式结果通过 WebSocket 回推
6. 所有项目、会话、消息和运行记录写入 MongoDB

## 3. 当前数据模型

- `users`
- `projects`
- `sessions`
- `messages`
- `runs`
- `approvals`

## 4. 当前限制

- Provider 当前已接入 `mock`、`claude`、`codex`，`cursor` 和 `gemini` 仍待补齐
- 文件、终端、Git 基础能力已接入，插件和任务系统尚未接入
- 运行事件还未沉淀为独立审计集合

## 5. 后续架构方向

- 增加 `provider-core`
- 增加 `orchestrator`
- 增加 `policy-engine`
- 增加 `plugin-runtime`
- 增加 `task-core`
