# RelayDesk 开发待办

最后更新：2026-03-30

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
- `done` Git 暂存、取消暂存、提交、分支切换/创建基础能力
- `done` 替身 AI Agent 最小审批流与待审批面板
- `done` 替身 AI Agent 人工接管与恢复运行基础能力
- `done` 替身 AI Agent 运行检查点与审计事件基础能力
- `done` 替身 AI Agent 检查点级恢复与最近运行回补
- `done` WebSocket 自动重连与工作台状态回补
- `done` Claude 真实 Provider 首条链路
- `done` Codex 真实 Provider 首条链路
- `done` Gemini 真实 Provider 首条链路
- `done` 本机项目发现与 CLI 历史会话导入
- `done` Claude / Codex / Gemini CLI 会话恢复与继续执行
- `done` Claude / Codex / Gemini Settings、MCP 与工具权限写回
- `done` CodeMirror 多标签编辑、快速打开与草稿状态保护
- `done` 多终端标签与重连回补
- `done` Git fetch / pull / push 远程同步
- `done` 插件安装与启停骨架
- `done` 插件宿主上下文、本地 manifest 与受控动作执行
- `done` 插件安装源、本地 / git 插件安装、后端 RPC 与执行历史
- `done` 任务工作台可执行面板、TaskMaster 显式写回与从任务发起替身运行
- `done` 开源治理与基础质量门禁

## 3. P0 待办

### 3.1 项目发现与旧会话导入

- `done` 建立本地工作区扫描与 provider 目录发现服务
- `done` 支持发现 `~/.claude`、`~/.codex`、`~/.gemini` 中的已有项目与会话
- `done` 增加“发现项目”和“RelayDesk 项目”的映射模型
- `todo` 支持手工补录路径、纠正映射与旧项目导入
- `todo` 为发现到的项目增加目录监听与页面状态回补

验收标准：

- 用户首次打开后可看到本机已有项目
- 用户可区分“发现到的项目”和“RelayDesk 内部项目”
- provider 目录发生变化后，列表可自动或手动刷新回补

### 3.2 CLI 会话桥接与 Provider 补齐

- `done` 将 `provider-core` 扩展为 `api mode` 与 `cli session mode` 双路径
- `done` 支持恢复并继续 Claude CLI 会话
- `done` 支持恢复并继续 Codex CLI 会话
- `done` 支持恢复并继续 Gemini CLI 会话
- `done` 统一不同 provider 的会话摘要、状态和停止控制
- `todo` 将导入会话升级为工作台一等对象，补充可恢复能力、最近恢复和最近失败元数据
- `todo` 统一 session 生命周期与状态机，覆盖聊天、终端和运行页的共享状态
- `todo` 为 session 增加统一的停止、恢复、重试入口
- `todo` 增加 session 级审计事件和恢复失败可视化反馈

验收标准：

- 用户可从工作台直接恢复已有 CLI 会话
- Claude、Codex、Gemini 具备一致的恢复入口
- 会话停止、刷新恢复与最近活动信息在 UI 中可见
- 同一条会话在聊天页、终端页和运行页状态一致

### 3.3 原生 CLI Session 工作台

- `todo` 在聊天页增加 session 头部卡片，展示 provider、来源、工作区、当前状态和可恢复性
- `todo` 支持从当前 session 打开或附着终端 tab
- `todo` 打通 session 与文件/Git/替身运行的共享上下文
- `todo` 重构项目 bootstrap 数据，聚合 activeSession、sessionCapabilities 和最近审计事件
- `todo` 增加 session 工作台的集成测试与 WebSocket 恢复测试

验收标准：

- 用户始终知道当前操作的是哪条 session
- 工作台模块切换后，会话上下文不丢失
- session 级恢复和重连路径具备自动化测试覆盖

### 3.4 Settings、MCP 与工具权限同步

- `done` 增加 Settings 页面骨架
- `done` 读取本地 CLI 配置中的 Provider 偏好、MCP 与工具权限信息
- `done` 支持在 UI 中修改关键配置并写回本地配置目录
- `done` 补齐 Gemini Settings、MCP 与工具权限写回
- `todo` 为高风险配置变更增加校验、差异提示与回写反馈

验收标准：

- 用户可在 UI 中看到当前本地配置状态
- MCP / 工具权限变更可同步到本地 CLI
- 配置错误不会静默覆盖本地内容

### 3.5 插件平台第一阶段

- `done` 抽象插件安装源，支持 built-in / local path / git repo 安装
- `done` 升级插件 manifest，覆盖后端服务、权限声明和版本信息
- `doing` 支持插件注册自定义 tab、工具面板入口和宿主上下文消费
- `done` 建立插件后端 RPC 主链路、执行历史和审计事件
- `done` 把当前白名单命令执行迁移到统一权限模型下

验收标准：

- 用户能从 UI 安装、禁用和卸载插件
- 插件可新增前端入口并调用受控后端 RPC
- 插件行为有执行历史、权限边界和错误反馈

### 3.6 替身 AI Agent 叠加到真实会话

- `done` 支持在发现到的真实 CLI 会话上启动替身 AI Agent
- `done` 让审批、接管、恢复与检查点围绕真实会话工作
- `done` 区分“RelayDesk 自建会话”和“provider 原生会话”的运行入口

验收标准：

- 替身 AI Agent 不再只依赖 RelayDesk 自建会话
- 审批、接管与恢复可和真实 CLI 会话上下文对齐

## 4. P1 待办

### 4.1 替身 AI Agent 深化

- `done` 增加审批模型和审批 API
- `done` 增加等待人工批准的运行状态
- `done` 增加人工接管动作
- `done` 增加停止后恢复运行能力
- `done` 增加运行检查点
- `done` 增加审计事件集合
- `done` 增加检查点级恢复
- `doing` 增加运行轨迹可视化增强

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

### 4.3 文件工作台升级

- `done` 将基础编辑器升级为更成熟的代码编辑器
- `done` 增加语法高亮、搜索、脏状态和保存反馈
- `todo` 支持从消息上下文直接打开文件
- `todo` 增加 Markdown、图片与二进制文件的基础预览

验收标准：

- 用户可在工作台中完成更接近日常开发的文件编辑
- 文件跳转与聊天上下文可以联动

### 4.4 终端工作台升级

- `todo` 引入更完整的终端渲染体验
- `done` 支持多终端标签页
- `done` 支持终端会话保活、重连与更长输出回补
- `doing` 将终端会话升级为 session-aware 工作能力

验收标准：

- 用户可同时管理多个终端
- 终端断开后可恢复最近上下文

### 4.5 Git 工作台进阶

- `done` 增加 pull / push / fetch 能力
- `doing` 增加远程分支和 upstream 信息管理
- `todo` 增加回滚、丢弃与冲突提示策略
- `todo` 让 Git 变更与消息流、替身运行上下文关联更清晰

验收标准：

- 用户可在工作台内完成本地提交后的远程同步
- 分支切换与远程跟踪信息可见
- 高风险 Git 操作具备明确提示

### 4.6 移动端观察与轻交互

- `todo` 为移动端重排项目页、聊天页和替身页布局
- `todo` 优先支持移动端查看运行状态、审批和停止操作
- `todo` 为较重的文件/终端/Git 操作提供降级体验

验收标准：

- 用户可在手机上完成观察、审批和基础控制
- 桌面优先体验不因移动端适配退化

## 5. P2 待办

### 5.1 任务与 PRD 管理

- `done` 增加任务模型与任务列表页
- `done` 补项目内文档引用能力
- `doing` 增加 PRD、路线图、测试报告与任务之间的关联
- `done` 增加 TaskMaster 可执行集成、显式同步与后续双向集成预留

### 5.2 通知能力

- `todo` 设计通知模型
- `todo` 支持审批、运行状态和失败事件的通知
- `todo` 为移动端观察提供通知入口

## 6. 技术债

- `todo` 为 API 增加 service / repository 分层
- `todo` 为前端引入统一状态层和数据请求层
- `todo` 将项目发现、CLI 会话桥接和配置同步拆成独立模块
- `todo` 把 mock stream 逻辑从路由流程中进一步解耦
- `done` 增加首条 Fastify inject API 集成测试
- `done` 增加替身运行状态流集成测试
- `done` 增加 WebSocket 订阅与项目事件回推集成测试
- `doing` 扩展自动化测试覆盖到更复杂运行恢复、终端 WebSocket 和页面联调

## 7. 本周建议执行顺序

1. 原生 CLI session 工作台
2. 插件系统安装、扩展与后端 RPC
3. Gemini Settings、MCP 与工具权限写回
4. 任务工作台从只读摘要升级为可管理的执行面板
5. 运行轨迹、运行回放与 policy-engine
