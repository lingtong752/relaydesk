# ClaudeCodeUI 重构合并说明（2026-04-05）

## 合并结论

- 建议：可合并。
- 结论依据：重构分阶段完成，且每阶段均通过 `npm run lint && npm run typecheck && npm test`。
- 最新门禁结果：`55 files / 158 tests passed`。

## 变更范围

- 前端重构：
  - chat 领域拆分（`view-model`、`actions`、`state`、`utils`）。
  - workspace 会话绑定路由统一（chat/files/terminal/git 共用逻辑）。
  - session origin 标签与 runtime 规则集中化。
- 后端重构：
  - `projects/sessions` 路由状态推导与文档构造抽离。
  - 新增共享错误契约 helper（`routeContracts`）并收敛以下入口：
    - `projects`
    - `sessions`
    - `runs`
    - `approvals`
    - `terminal`
    - `tasks`
- 回归加固：
  - 新增/增强负向合同测试，覆盖无效 ID、缺失资源、非法 payload、冲突路径。

## 行为不变性说明

- 本轮重构目标是“结构收敛 + 契约固化”，不引入功能语义变更。
- 已通过测试锁定以下稳定行为：
  - 会话创建、消息收发、会话能力字段和 runtime mode。
  - chat 到 tools 的绑定会话路由参数一致性。
  - run/approval 主链路（创建、审批、接管、恢复、拒绝）。
  - terminal 会话创建、复连与关闭链路。
  - tasks 面板更新、冲突检测与 start-run 绑定。

## 核心验证证据

- 自动化门禁：
  - `npm run lint` 通过。
  - `npm run typecheck` 通过。
  - `npm test` 通过（`55 files / 158 tests passed`）。
  - `npm run verify:claudecodeui-refactor` 可一键复验关键链路。
- CI 分层：
  - `fast-verify`：PR 快速门禁（`ci:fast`）。
  - `full-regression`：push/schedule 全量回归（`ci:full`）。
- 关键测试文件：
  - `apps/api/src/routes/projects.integration.test.ts`
  - `apps/api/src/routes/sessions.integration.test.ts`
  - `apps/api/src/routes/runs.integration.test.ts`
  - `apps/api/src/ws/terminal.integration.test.ts`
  - `apps/api/src/routes/tasks.integration.test.ts`
  - `apps/web/src/pages/WorkspaceToolsPage.test.tsx`
  - `apps/web/src/pages/WorkspaceChatPage.test.tsx`

## 关键提交（建议重点审阅）

- `1f916bb` `refactor(api): align task routes with shared error contracts`
- `564a1a5` `refactor(api): align terminal routes with shared error contracts`
- `35ef3e8` `refactor(api): align approvals routes with shared error contracts`
- `f5eec76` `refactor(api): align runs routes with shared error contracts`
- `46c8ad5` `refactor(api): centralize shared route error contracts`
- `fc6f09c` `refactor(workspace): unify bound-session routing across chat and tools`
- `d774c13` `refactor(chat): extract workspace chat page actions`
- `def8027` `refactor(chat): extract current session panel view model`
- `9c4c0e8` `refactor(chat): split composer and session runtime side-effect logic`

## 风险余项

- 自动化覆盖已充分，但仍建议在真实仓库目录执行一次人工抽样：
  - 插件安装/升级/执行主链路。
  - Git fetch/pull/push 与分支切换链路。
- API 错误契约已引入 `errorCode`，后续新增路由建议沿用同一模式。

## 回滚建议

- 若发现上线回归，可按提交粒度回退：
  - API 契约收敛链：`1f916bb` -> `564a1a5` -> `35ef3e8` -> `f5eec76` -> `46c8ad5`
  - 前端会话路由链：`fc6f09c`
- 回滚后执行同一门禁命令确认恢复状态。
