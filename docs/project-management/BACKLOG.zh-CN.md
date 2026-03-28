# RelayDesk 开发待办

最后更新：2026-03-28

## 1. 说明

本待办用于承接 PRD 和路线图中的具体开发任务，按优先级和阶段整理。状态说明：

- `todo`
  尚未开始
- `doing`
  正在进行
- `done`
  已完成
- `blocked`
  有前置依赖或外部阻塞

## 2. 当前已完成

- `done` 新仓初始化与 monorepo 结构
- `done` MongoDB 连接与基础集合
- `done` JWT 鉴权
- `done` 项目、会话、消息、运行 API 骨架
- `done` WebSocket 实时订阅链路
- `done` 登录页、项目页、工作台页骨架
- `done` 替身 AI Agent 启动与停止基础流程
- `done` 文档目录与 PRD、测试、路线图、架构文档
- `done` 文件树、基础编辑器、浏览器终端工作台
- `done` Git 状态与 diff 只读面板
- `done` 替身 AI Agent 最小审批流与待审批面板
- `done` 替身 AI Agent 人工接管与恢复运行基础能力
- `done` WebSocket 自动重连与工作台状态回补
- `done` Claude 真实 Provider 首条链路
- `done` Codex 真实 Provider 首条链路
- `done` 开源治理与基础质量门禁

## 3. P0 待办

### 3.1 文件工作台

- `done` 建立项目文件树 API
- `done` 支持读取文件内容
- `done` 支持保存文本文件
- `done` 在工作台中加入文件树面板
- `done` 在工作台中加入基础编辑器区域

验收标准：

- 用户可在项目维度浏览文件树
- 用户可打开文本文件并保存修改
- 文件面板与消息工作台可以共存

### 3.2 终端工作台

- `done` 建立基于 WebSocket 的终端链路
- `done` 引入 `node-pty`
- `done` 支持项目根路径下启动 Shell
- `done` 前端增加终端面板

验收标准：

- 用户可在浏览器中执行项目目录命令
- 终端输出可实时回传
- 基础连接断开后可重新建立

### 3.3 Git 工作台基础

- `done` 建立 Git 状态 API
- `done` 提供当前分支、工作区脏状态、变更文件列表
- `done` 提供按文件查看 diff
- `done` 前端增加 Git 状态面板

验收标准：

- 用户可看到当前项目 Git 状态
- 用户可查看变更文件列表
- 用户可查看单文件 diff

## 4. P1 待办

### 4.1 替身 AI Agent 深化

- `done` 增加审批模型和审批 API
- `done` 增加等待人工批准的运行状态
- `done` 增加人工接管动作
- `done` 增加停止后恢复运行能力
- `todo` 增加运行检查点
- `todo` 增加审计事件集合

验收标准：

- 高风险动作必须进入审批
- 用户可从替身模式切回人工模式
- 运行关键节点可追溯

### 4.2 可靠性与恢复

- `done` WebSocket 重连策略
- `done` 会话和运行的刷新恢复
- `todo` 统一错误提示模型
- `todo` 关键页面加载骨架和空态

验收标准：

- 浏览器刷新后可恢复当前项目与会话
- 断线后可重新订阅频道

## 5. P2 待办

### 5.1 Provider 适配层

- `todo` 提取 `provider-core`
- `done` 接入真实 Claude provider
- `done` 接入真实 Codex provider
- `todo` 接入真实 Cursor provider
- `todo` 接入真实 Gemini provider

验收标准：

- Provider 适配层不依赖具体页面
- 单个 Provider 接入不影响共享消息模型

### 5.2 插件与任务系统

- `todo` 建立插件安装和启停骨架
- `todo` 设计插件宿主上下文
- `todo` 增加任务模型与任务列表页
- `todo` 补项目内文档引用能力

## 6. 技术债

- `todo` 为 API 增加 service / repository 分层
- `todo` 为前端引入统一状态层和数据请求层
- `todo` 把 mock stream 逻辑从路由流程中进一步解耦
- `doing` 扩展自动化测试覆盖到 API 集成、WebSocket 和运行状态机

## 7. 本周建议执行顺序

1. Git 工作台从只读扩展到提交与分支操作
2. 运行检查点与审计事件
3. API 集成测试与状态机测试
4. Cursor / Gemini Provider 接入
