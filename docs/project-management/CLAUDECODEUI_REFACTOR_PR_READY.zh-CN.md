# PR 标题（建议）

`refactor: complete claudecodeui migration with contract hardening and ci layering`

# PR 正文（可直接粘贴）

## 变更摘要

- 完成 ClaudeCodeUI 重构迁移，保持功能完整性不回退。
- 收敛 API 错误契约（统一 `errorCode` + `message`），补齐负向合同测试。
- 增加 `x-correlation-id` 与关键 run/session/approval 日志链路。
- 统一 workspace tools 的绑定会话解析逻辑（query 优先 + selected fallback）。
- CI 分层为 `fast-verify`（PR）+ `full-regression`（push/schedule）。
- 增加 Phase 6 人工抽样清单与合并说明文档。

## 主要改动

### API / Contracts / Observability

- `packages/shared/src/index.ts`
  - 新增 `ApiErrorCode` / `ApiErrorRecord`。
- `apps/api/src/services/routeContracts.ts`
  - 错误响应统一输出 `{ message, errorCode }`。
- `apps/api/src/services/observability.ts`
  - 新增 correlation id 解析与日志 helper。
- `apps/api/src/app.ts`
  - 增加响应头 `x-correlation-id`。
- `apps/api/src/routes/sessions.ts`
- `apps/api/src/routes/runs.ts`
- `apps/api/src/routes/approvals.ts`
  - 关键路径增加 correlation 日志事件。

### Web / State

- `apps/web/src/features/workspace/sessionRouting.ts`
  - 新增统一解析入口：
  - `resolveWorkspaceToolSessionId`
  - `resolveWorkspaceToolSession`
- `apps/web/src/pages/WorkspaceFilesToolPage.tsx`
- `apps/web/src/pages/WorkspaceTerminalToolPage.tsx`
- `apps/web/src/pages/WorkspaceGitToolPage.tsx`
  - 工具页统一使用同一会话绑定解析策略。

### CI / Docs

- `.github/workflows/ci.yml`
  - 新增 `fast-verify` + `full-regression`。
- `package.json`
  - 新增 `ci:fast` / `ci:full`。
- `docs/testing/PHASE6_MANUAL_SAMPLING_CHECKLIST-2026-04-05.md`
  - 新增 Phase 6 人工抽样清单。
- 重构计划、回归报告、合并说明、PR 模板同步更新。

## 验证结果

- `npm run ci:fast` ✅
- `npm run ci:full` ✅
- 全量测试：`55 files / 158 tests passed`
- 关键链路 smoke：`7 files / 30 tests passed`

## 风险与回滚

- 风险等级：低到中（以结构收敛、契约加固为主）。
- 潜在风险：真实目录下插件/Git链路差异。
- 回滚建议：按提交粒度回退（API 收敛链、Web 路由收敛链、CI/Docs 链）。

## 人工抽样（建议在合并前执行）

- [ ] chat：创建会话、发送消息、切换会话
- [ ] tools：chat -> files/terminal/git 绑定会话一致
- [ ] run/approval：start/approve/reject/takeover/resume 主链路
- [ ] terminal：创建、复连、关闭
- [ ] plugins/git：真实目录端到端冒烟
