# ClaudeCodeUI 重构回归报告（2026-04-05）

## 结论

- 结论：通过。
- 范围：Phase 5（`projects/sessions/runs/approvals/terminal/tasks` 错误契约收敛 + 负向合同补齐）。
- 自动化结果：`npm run lint`、`npm run typecheck`、`npm test` 全绿。
- 最新全量测试：`55 files / 154 tests passed`。

## 本轮关键提交

- `1f916bb` `refactor(api): align task routes with shared error contracts`
- `564a1a5` `refactor(api): align terminal routes with shared error contracts`
- `35ef3e8` `refactor(api): align approvals routes with shared error contracts`
- `f5eec76` `refactor(api): align runs routes with shared error contracts`
- `46c8ad5` `refactor(api): centralize shared route error contracts`
- `6869242` `test(api): add negative contracts for project and session routes`

## 合同一致性检查（自动化）

- `sessions`：无效 `projectId/sessionId`、缺失 `session/project`、不支持的 imported CLI 续跑冲突。
- `projects`：`bootstrap` 无效/缺失项目、创建项目非法 payload。
- `runs`：创建运行与停止运行的无效 ID/缺失资源路径。
- `approvals`：审批列表无效/缺失 run，approve/reject 非法 payload。
- `terminal`：list/create/close 的项目鉴权与 project guard。
- `tasks`：项目 guard、patch 非法 payload、start-run 的 session 校验路径。

## Phase 6 人工抽样清单（待执行）

- `chat`：创建会话 -> 发送消息 -> 切换会话，确认消息区与状态提示一致。
- `tools`：从 chat 跳转到 files/terminal/git，确认绑定会话参数与上下文一致。
- `run/approval`：从任务或聊天发起 run，走 approve/reject/takeover/resume 主链路。
- `terminal`：创建终端、断线重连、关闭会话，确认 backlog 与权限边界。

## 风险与遗留

- 本轮主要为“契约收敛 + 负向测试补齐”，行为变更风险低。
- 仍建议在真实工作目录进行一次端到端人工抽样，覆盖插件安装与 Git 同步链路。
