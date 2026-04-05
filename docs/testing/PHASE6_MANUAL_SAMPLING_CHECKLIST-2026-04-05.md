# Phase 6 人工抽样清单（2026-04-05）

## 说明

- 目标：补齐 ClaudeCodeUI 重构的人工链路验收证据。
- 状态：已创建清单并完成自动化替代证据；真实交互抽样待执行。
- 自动化替代：`npm run verify:claudecodeui-refactor`（`7 files / 29 tests passed`）。

## 抽样项

| 链路 | 检查项 | 当前状态 | 备注 |
|---|---|---|---|
| chat | 创建会话、发送消息、切换会话 | 待人工确认 | 自动化已覆盖核心契约与页面渲染 |
| tools | chat -> files/terminal/git 绑定会话一致性 | 待人工确认 | 自动化已覆盖 query + selected fallback |
| run/approval | start/approve/reject/takeover/resume | 待人工确认 | 自动化已覆盖主链路与负向合同 |
| terminal | 创建、复连、关闭、权限边界 | 待人工确认 | WebSocket 集成测试通过 |
| plugins/git | 真实目录端到端冒烟 | 待人工确认 | 建议在真实远端环境执行 |

## 执行建议

1. 在真实项目目录登录后，从 chat 页面发起完整链路操作并记录截图。
2. 对每个链路补一条“输入 -> 预期 -> 实际”记录，写回本清单。
3. 若发现差异，关联具体提交和回滚点（见 merge notes）。
