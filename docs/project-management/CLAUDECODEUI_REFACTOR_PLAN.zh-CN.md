# ClaudeCodeUI 重构计划（当前分支）

## 目标与原则

- 目标：在当前分支完成 `claudecodeui` 风格重构，同时保持既有功能完整可用。
- 原则：行为先冻结、改动分切片、每步可回滚、每步可验证。
- 约束：不在同一提交中同时进行“目录重排 + 业务逻辑改动”。

## 交付范围

- 前端：聊天工作台布局、会话列表、消息区、输入区、工作区入口（文件/终端/Git）。
- 后端：项目 bootstrap、会话查询/恢复、运行能力字段与状态回补。
- 协议：前后端共享类型与会话能力契约保持一致。
- 测试：保持现有测试全绿，并补充重构过程中的最小回归护栏。

## 分阶段执行

### Phase 0 - 基线冻结（Day 0）

- 锁定当前分支基线提交（用于回滚比较）。
- 产出功能完整性清单（见下文验收矩阵）。
- 固化命令门禁：`npm run lint && npm run typecheck && npm test`。

完成标准：

- 可重复执行的基线验证命令与结果已记录。

### Phase 1 - 测试护栏补齐（Day 1）

- 补齐关键路径 smoke 与契约断言（重点：会话列表、消息收发、bootstrap）。
- 为新增 UI 区块补最小组件级测试（SSR 渲染断言即可）。

完成标准：

- 新增测试不依赖真实外部服务。
- 全量测试通过。

### Phase 2 - 结构重排（Day 2）

- 在不改行为前提下整理模块边界：`layout`、`chat`、`workspace`、`runtime`、`api`。
- 提供兼容层，先保持原调用方不变。

完成标准：

- 页面行为无变化。
- 目录结构更清晰，重复依赖减少。

### Phase 3 - 聊天域重构（Day 3-4）

- 重构会话列表与当前会话视图，统一状态来源。
- 抽离消息输入与消息流逻辑，减少页面层副作用。

完成标准：

- 会话切换、消息发送、恢复状态展示与重构前一致。

### Phase 4 - 工作区联动重构（Day 5）

- 打通会话与文件/终端/Git 跳转参数传递。
- 统一 “绑定会话” 的路由查询参数处理策略。

完成标准：

- 从聊天页跳转到工具页后，上下文会话保持一致。

### Phase 5 - API/契约收口（Day 6）

- 整理 `projects/sessions` 路由返回字段一致性。
- 收口共享类型，删除重复字段和过时分支。

完成标准：

- 前后端契约无歧义，类型检查通过。

### Phase 6 - 回归与发布准备（Day 7）

- 全功能回归（自动化 + 人工抽样）。
- 输出重构总结（改动范围、风险、后续遗留项）。

完成标准：

- 功能完整性验收矩阵全部通过或有明确豁免说明。

## 功能完整性验收矩阵

| 模块 | 核心场景 | 自动化覆盖 | 人工回归 |
|---|---|---|---|
| 认证 | 注册/登录/鉴权访问 | `apps/api/src/routes/auth.test.ts` | 登录后进入项目页 |
| 项目 | 创建项目、bootstrap、本地发现 | `apps/api/src/routes/projects.integration.test.ts` | 项目列表与名称展示 |
| 会话 | 创建/选择/恢复会话 | `apps/web/src/pages/WorkspaceChatPage.test.tsx` | 会话切换与状态提示 |
| 消息 | 发送消息、消息列表展示 | `apps/web/src/features/chat/components/MessageList.test.tsx` | 发送后列表更新 |
| 会话列表 | 会话元信息、能力标识展示 | `apps/web/src/features/chat/components/SessionListPanel.test.tsx` | Provider/能力标签正确 |
| 工具页联动 | chat -> files/terminal/git 会话绑定 | `apps/web/src/pages/WorkspaceToolsPage.test.tsx` | 跳转后绑定会话正确 |
| 文件 | 文件搜索/读取链路 | `apps/api/src/routes/files.integration.test.ts` | 搜索结果与预期一致 |
| 终端 | 终端连接与重连回补 | `apps/api/src/ws/terminal.integration.test.ts` | 断线重连可恢复 |
| Git | 状态、提交、分支、同步 | `apps/api/src/routes/git.integration.test.ts` | 常用 Git 操作成功 |
| 设置 | Provider 设置读写 | `apps/api/src/routes/settings.integration.test.ts` | 设置保存后生效 |
| 插件 | 安装、升级、执行、卸载 | `apps/api/src/routes/plugins.integration.test.ts` | 插件可见且可执行 |
| 任务 | 任务列表、执行链路 | `apps/api/src/routes/tasks.integration.test.ts` | 任务执行状态可见 |

## 提交与回滚策略

- 每阶段至少 1 个独立提交，命名建议：
  - `refactor(layout): ...`
  - `refactor(chat): ...`
  - `refactor(workspace): ...`
  - `refactor(api): ...`
- 任一阶段失败，回滚到上一个“全量测试通过”提交，不跨阶段硬修。
- 严禁在未通过门禁前继续叠加下阶段改动。

## 风险与应对

- 风险：UI 重构导致隐式交互变化。
  - 应对：关键路径加 smoke，人工回归补充交互细节。
- 风险：会话能力字段不一致导致前端误判。
  - 应对：共享类型收口，API 契约断言。
- 风险：重构跨度过大导致定位困难。
  - 应对：按阶段提交 + 每阶段单独验收。

## 里程碑检查点

- M1：测试护栏完成，主流程可回归。
- M2：聊天域重构完成，体验与行为稳定。
- M3：工具联动与 API 契约收口完成。
- M4：全量回归完成，可合并主干。

## 执行进度（持续更新）

- 时间：2026-04-05（当前分支：`codex-refactor-claudecodeui`）
- 当前状态：Phase 0/1/2/3/4/5 已完成；Phase 6 进行中（已产出抽样清单与合并材料，待真实环境抽样确认）。
- 质量门禁：每刀后均通过 `npm run lint && npm run typecheck && npm test`（最新：`55 files / 154 tests passed`）。
- 阶段产物：已新增 `docs/testing/TEST_REPORT-2026-04-05-CLAUDECODEUI-REFACTOR.md` 作为 Phase 6 回归基线。
- 阶段产物：已新增 `docs/project-management/CLAUDECODEUI_REFACTOR_MERGE_NOTES.zh-CN.md` 作为合并审阅材料。
- 阶段产物：已新增 `docs/project-management/CLAUDECODEUI_REFACTOR_PR_TEMPLATE.zh-CN.md` 作为 PR 提交流水线模板。
- 阶段产物：新增 `npm run verify:claudecodeui-refactor` 一键复验命令（关键链路 `7 files / 29 tests`）。
- 阶段产物：新增 `docs/testing/PHASE6_MANUAL_SAMPLING_CHECKLIST-2026-04-05.md` 人工抽样清单。

### 已落地提交（按时间倒序）

- `1f916bb` `refactor(api): align task routes with shared error contracts`
- `564a1a5` `refactor(api): align terminal routes with shared error contracts`
- `35ef3e8` `refactor(api): align approvals routes with shared error contracts`
- `f5eec76` `refactor(api): align runs routes with shared error contracts`
- `c69278b` `docs: refresh refactor progress after api contract consolidation`
- `46c8ad5` `refactor(api): centralize shared route error contracts`
- `995b3f4` `docs: sync claudecodeui refactor phase progress`
- `6869242` `test(api): add negative contracts for project and session routes`
- `fc6f09c` `refactor(workspace): unify bound-session routing across chat and tools`
- `41c510b` `docs: update claudecodeui refactor progress and next milestones`
- `1968571` `refactor(web): centralize session origin labels in runtime helpers`
- `b40f52a` `refactor(shared): centralize imported CLI resumable provider rules`
- `d774c13` `refactor(chat): extract workspace chat page actions`
- `def8027` `refactor(chat): extract current session panel view model`
- `9c4c0e8` `refactor(chat): split composer and session runtime side-effect logic`
- `ac910ab` `test(api): strengthen bootstrap and session message contract assertions`
- `fc3846e` `refactor(api): extract project and session route state helpers`
- `19c43f0` `refactor(workspace): extract bootstrap state reducers and selectors`
- `3669f85` `refactor(chat): extract session list ordering and filter utilities`
- `cee1176` `refactor(layout): extract project layout command palette types and utilities`
- `08bf8f0` `test: add refactor guardrails for workspace navigation and session contracts`

### 下一步（计划）

- 启动 Phase 6：整理人工抽样回归清单（chat -> tools -> run -> approval 主链路）。
- Phase 6 执行：按“会话创建 -> 消息收发 -> tool 跳转 -> run 审批 -> terminal 复连”链路逐项记录检查结果。
- 收尾准备：合并说明已产出，剩余真实目录人工抽样与 PR 提交。
- 持续优化：新增 `errorCode` 错误契约、`x-correlation-id` 可观测性与 CI 分层执行策略。
