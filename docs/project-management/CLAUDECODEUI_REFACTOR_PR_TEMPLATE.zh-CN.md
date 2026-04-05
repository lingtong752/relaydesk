# PR 模板：ClaudeCodeUI 重构（当前分支）

## 变更摘要

- 完成 chat/workspace/api 的分阶段重构，保持既有功能完整性。
- 收敛 `projects/sessions/runs/approvals/terminal/tasks` 错误契约与负向测试。
- 抽离关键状态与路由复用逻辑，减少页面副作用与路由分支重复。

## 主要改动

- 前端：
  - chat 相关 `view-model/actions/state` 抽离。
  - chat -> tools 绑定会话路由统一。
  - session runtime/origin 标签与规则集中化。
- 后端：
  - `routeContracts` 统一 400/404 错误契约映射。
  - 路由层重复校验分支收敛。
  - 负向合同断言补齐。
- 文档：
  - 重构计划、回归报告、合并说明同步更新。

## 验证结果

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm test` ✅（`55 files / 154 tests passed`）

## 风险评估

- 风险等级：低到中（以结构重排与契约收敛为主）。
- 主要风险：
  - 隐式 UI 交互差异（需人工抽样）。
  - 插件安装链路与真实 Git 远程环境差异。

## 人工抽样建议

- [ ] chat：创建会话、发送消息、切换会话状态。
- [ ] tools：chat -> files/terminal/git 路由与绑定会话一致。
- [ ] run/approval：创建 run、approve/reject/takeover/resume。
- [ ] terminal：创建、复连、关闭、权限边界。
- [ ] plugins/git：在真实目录执行一次端到端冒烟。

## 相关文档

- `docs/project-management/CLAUDECODEUI_REFACTOR_PLAN.zh-CN.md`
- `docs/testing/TEST_REPORT-2026-04-05-CLAUDECODEUI-REFACTOR.md`
- `docs/project-management/CLAUDECODEUI_REFACTOR_MERGE_NOTES.zh-CN.md`
