# RelayDesk

RelayDesk 是一个面向开源协作的多 Provider AI 协作平台。它聚合 Claude、Codex、Cursor、Gemini 等底层能力，并通过更清晰的前后端边界、MongoDB 主存储和可扩展的 Provider/替身 AI Agent 架构，为项目协作、流程控制和运行观察提供统一入口。

当前阶段的主策略不是继续堆叠“新平台能力”，而是先补齐对现有 CLI 生态的兼容层，并在此基础上把 RelayDesk 推进成真正的“AI 执行控制台”：先实现旧项目导入、历史会话发现与恢复、CLI 原生配置同步，以及更成熟的文件/终端/Git 工作台；再叠加插件系统、任务系统和替身 AI Agent 编排能力。

## 当前已实现

- MongoDB 持久化
- Fastify + WebSocket API
- JWT 鉴权
- 项目、会话、消息、运行中的替身 AI Agent 骨架
- 本机项目发现与 CLI 历史会话导入
- Claude / Codex / Gemini CLI 会话恢复与继续执行
- Claude / Codex Settings、MCP 与工具权限写回同步
- 文件树、CodeMirror 多标签编辑、快速打开与草稿状态保护
- 浏览器终端、多终端标签与重连回补
- Git 状态、diff、暂存/取消暂存、提交、分支切换/创建，以及 fetch / pull / push
- 替身 AI Agent 审批面板与 approve/reject 主链路
- 替身 AI Agent 人工接管与恢复运行主链路
- 替身 AI Agent 运行检查点、审计事件与检查点级恢复
- WebSocket 自动重连与页面状态回补
- `provider-core` 统一 Provider 适配层基础结构
- Claude 真实 Provider 首条接入链路
- Codex 真实 Provider 首条接入链路
- Gemini 真实 Provider 首条接入链路
- 插件系统基础框架、本地插件 manifest 与受控动作执行
- 任务工作台与 TaskMaster 只读摘要
- React + Vite 前端应用
- 文档中心、路线图、API 规范和数据模型文档

## 当前限制

- `cursor` 暂未纳入当前产品里程碑，近阶段不作为集成目标
- Claude / Codex 已支持本地配置写回；Gemini / Cursor 当前仍为只读摘要
- 插件运行时当前仍是受控模式，只支持白名单命令和项目根目录内执行
- 任务系统当前为只读骨架，尚未落地 RelayDesk 内建任务持久化或 TaskMaster 双向同步
- Git 工作台仍缺回滚、丢弃、冲突处理等更高风险操作策略
- 移动端当前以观察与轻交互为主，尚未对文件 / 终端 / Git 做深度适配
- 替身 AI Agent 仍缺更细粒度的风险策略、运行回放和 policy-engine

## 近期优先级

- 把任务工作台从只读摘要升级为真正可管理的执行面板
- 扩展插件运行时的权限分级、执行历史和后端 RPC 能力
- 补齐 Gemini Settings / MCP / 工具权限写回
- 增强替身 AI Agent 运行轨迹、运行回放和 policy-engine
- 修正文档与包体积等提交前技术收尾项

## 快速开始

1. 复制 `.env.example` 为 `.env`
2. 如果要使用 Claude、Codex 或 Gemini 会话，分别配置 `ANTHROPIC_API_KEY`、`OPENAI_API_KEY` 或 `GEMINI_API_KEY`
3. 安装依赖：`npm install`
4. 启动 API：`npm run dev:api`
5. 启动 Web：`npm run dev:web`
6. 打开 `http://127.0.0.1:5173`

## 常用脚本

- `npm run dev:api`
- `npm run dev:web`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run check`

## 仓库结构

- `apps/web`
  React 前端应用
- `apps/api`
  Fastify API 与 WebSocket 服务
- `packages/shared`
  前后端共享类型和事件协议
- `docs`
  产品、架构、测试和项目管理文档

## 文档

项目关键文档统一放在 [docs/README.md](./docs/README.md)：

- 产品需求文档
- 测试报告
- 项目路线图
- 开发待办
- API 规范
- 数据模型

## 开源协作

如果你准备参与开发，请先阅读：

- [贡献指南](./CONTRIBUTING.md)
- [行为准则](./CODE_OF_CONDUCT.md)
- [安全策略](./SECURITY.md)

## 路线图

当前优先级见 [docs/project-management/ROADMAP.zh-CN.md](./docs/project-management/ROADMAP.zh-CN.md) 和 [docs/project-management/BACKLOG.zh-CN.md](./docs/project-management/BACKLOG.zh-CN.md)。

## 许可证

本项目采用 [MIT License](./LICENSE)。
