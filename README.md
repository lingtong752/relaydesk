# RelayDesk

RelayDesk 是一个面向开源协作的 AI Agent 工作台重写项目。它的目标不是单纯复制旧项目，而是用更清晰的前后端边界、MongoDB 主存储和可扩展的 Provider/替身 AI Agent 架构，重新实现一个适合长期演进和公开协作的产品基础。

## 当前已实现

- MongoDB 持久化
- Fastify + WebSocket API
- JWT 鉴权
- 项目、会话、消息、运行中的替身 AI Agent 骨架
- 文件树与基础文本编辑器
- 浏览器终端工作台
- Git 状态与 diff 工作台
- 替身 AI Agent 审批面板与 approve/reject 主链路
- 替身 AI Agent 人工接管与恢复运行主链路
- WebSocket 自动重连与工作台状态回补
- Claude 真实 Provider 首条接入链路
- Codex 真实 Provider 首条接入链路
- React + Vite 前端工作台
- 文档中心、路线图、API 规范和数据模型文档

## 当前限制

- 真实 Provider 当前已接入 `claude` 和 `codex`，其余仍为占位适配
- Git 工作台当前为只读基础版，尚未支持暂存、提交、分支管理
- 插件和任务系统尚未接入
- 替身 AI Agent 还缺检查点级恢复和更细粒度的风险策略

## 快速开始

1. 复制 `.env.example` 为 `.env`
2. 如果要使用 Claude 或 Codex 会话，分别配置 `ANTHROPIC_API_KEY` 或 `OPENAI_API_KEY`
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
  React 前端工作台
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
