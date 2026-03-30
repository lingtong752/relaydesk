# RelayDesk 架构总览

最后更新：2026-03-29

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
3. 用户创建项目，或后续通过发现服务导入已有项目
4. 用户新建会话，或后续恢复已有 CLI 会话
5. 普通消息通过 REST 提交，或由 CLI 会话桥接层转发到底层运行时
6. Provider 或替身 AI Agent 的流式结果通过 WebSocket 回推
7. 所有项目、会话、消息和运行记录写入 MongoDB，并为本地配置同步、插件宿主和任务看板提供统一边界

## 3. 当前数据模型

- `users`
- `projects`
- `sessions`
- `messages`
- `runs`
- `approvals`
- `audit_events`
- `run_checkpoints`
- `plugin_installations`

## 4. 当前限制

- Provider 当前已稳定接入 `mock`、`claude`、`codex`、`gemini`，`cursor` 暂不纳入近阶段里程碑
- `provider-core` 已完成首轮抽离，当前真实 Provider 与占位 provider 已统一走适配层
- 本地 CLI 项目发现、历史会话恢复和 provider 原生 session 继续执行链路已落地，Gemini 配置写回已补齐，`cursor` 仍未进入本轮范围
- Settings、MCP 配置和工具权限同步当前已支持 Claude / Codex / Gemini 写回，`cursor` 仍为只读摘要
- 文件、终端、Git、插件和任务面板都已接入；插件平台已支持 local / git 安装源、后端 RPC 和执行历史，任务面板已支持显式写回 TaskMaster 与从任务发起运行
- 运行检查点与审计事件已落地，并支持从检查点恢复到待审批状态

## 5. 后续架构方向

- 增加 `discovery-service`
- 增加 `cli-session-bridge`
- 增加 `config-sync`
- 增加 `workspace-runtime`
- 增加 `orchestrator`
- 增加 `policy-engine`
- 增加 `plugin-runtime`
- 增加 `task-core`
- 增加 `task-board-service`
