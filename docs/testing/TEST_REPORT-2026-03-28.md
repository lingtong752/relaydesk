# RelayDesk 测试报告

日期：2026-03-28

报告类型：阶段性冒烟验证

适用范围：`relaydesk` 当前 alpha 版本

## 1. 测试目标

验证新仓当前是否具备最小可用骨架能力，包括：

- 依赖安装
- TypeScript 类型检查
- 前端生产构建
- API 启动与健康检查
- MongoDB 连接可用性
- 核心业务链路冒烟测试
- 文件工作台基础能力
- 终端工作台基础能力
- Git 工作台基础能力
- 替身 AI Agent 审批流基础能力
- 替身 AI Agent 人工接管与恢复运行基础能力
- WebSocket 自动重连与状态回补基础能力
- Claude 真实 Provider 适配基础能力
- Codex 真实 Provider 适配基础能力

## 2. 测试环境

- Node.js：`v22.22.0`
- pnpm：`8.0.0`
- 数据库：本机 `MongoDB`，地址 `mongodb://127.0.0.1:27017`
- API 端口：`4010`
- Web 端口：`5173`

## 3. 执行结果

### 3.1 工程验证

- `npm install`
  结果：通过
- `npm run typecheck`
  结果：通过
- `npm run build`
  结果：通过
- `npm run check`
  结果：通过
- `npm run test`
  结果：通过，当前共 11 个测试文件、26 个测试用例

### 3.2 运行验证

- API 开发服务启动
  结果：通过
- Web 开发服务启动
  结果：通过
- `GET /api/health`
  结果：通过，返回 `{"ok":true,"service":"relaydesk-api"}`
- 本机 MongoDB 端口可达性检查
  结果：通过，返回 `MONGO_OPEN`

### 3.3 业务冒烟测试

已验证链路：

1. 注册新用户
2. 创建项目
3. 创建会话
4. 发送普通消息
5. 启动替身 AI Agent 运行
6. 人工审批通过后继续运行

### 3.4 文件工作台验证

- 文件路径边界测试
  结果：通过
- 文件树目录读取测试
  结果：通过
- 文本文件保存与读取测试
  结果：通过

### 3.5 终端工作台验证

- 终端链路类型检查与构建验证
  结果：通过
- 终端前后端联调骨架接入
  结果：通过
- `node-pty` 集成编译
  结果：通过

### 3.6 Git 工作台验证

- Git 状态解析测试
  结果：通过
- Git diff 读取与提示逻辑测试
  结果：通过
- Git 暂存、取消暂存、提交、分支切换单测
  结果：通过
- Git 状态 API 与前端面板构建验证
  结果：通过

### 3.7 替身 AI Agent 审批流验证

- 审批辅助逻辑单测
  结果：通过
- 运行进入 `waiting_human` 状态的类型与构建验证
  结果：通过
- approve/reject API 与前端审批面板构建验证
  结果：通过

### 3.8 人工接管与恢复运行验证

- 人工接管辅助逻辑单测
  结果：通过
- takeover/resume API 类型与构建验证
  结果：通过
- 前端控制条与恢复审批链路构建验证
  结果：通过

### 3.9 WebSocket 重连与状态回补验证

- WebSocket 自动重连逻辑单测
  结果：通过
- 频道自动重订阅验证
  结果：通过
- 工作台在重连后重新拉取项目和消息状态的类型与构建验证
  结果：通过
- WebSocket 订阅、断开重连后重新订阅与项目事件回推集成测试
  结果：通过

### 3.10 Claude Provider 基础验证

- Claude 消息映射逻辑单测
  结果：通过
- Claude provider 运行时类型与构建验证
  结果：通过
- 前端 Claude 会话选择与构建验证
  结果：通过

### 3.11 Codex Provider 基础验证

- Codex Responses API 消息映射逻辑单测
  结果：通过
- Codex provider 运行时类型与构建验证
  结果：通过
- 前端 Codex 会话选择与构建验证
  结果：通过

### 3.12 运行检查点与审计事件验证

- 运行轨迹写入 helper 单测
  结果：通过
- MongoDB 序列化与 API 类型验证
  结果：通过
- 前端运行轨迹面板构建验证
  结果：通过

### 3.13 API 集成与状态机验证

- Fastify inject 鉴权、项目、会话、运行链路集成测试
  结果：通过
- 替身运行从 waiting_human -> running -> paused -> waiting_human -> stopped 状态流测试
  结果：通过
- 审计事件与检查点 API 查询测试
  结果：通过
- 从指定检查点恢复到 waiting_human 并重新生成审批测试
  结果：通过

### 3.14 Provider Core 验证

- `provider-core` 适配器注册表测试
  结果：通过
- 占位 provider 回退到 unsupported adapter 测试
  结果：通过
- `mock` / `claude` / `codex` / `gemini` 历史消息映射兼容性测试
  结果：通过

### 3.15 Gemini Provider 基础验证

- Gemini contents 历史映射逻辑单测
  结果：通过
- Gemini provider 运行时类型与构建验证
  结果：通过

### 3.16 Provider 失败场景验证

- Claude 上游错误消息透传测试
  结果：通过
- Codex 空响应防御测试
  结果：通过
- Gemini 安全拦截错误提示测试
  结果：通过
- Provider 中止错误透传测试
  结果：通过

### 3.17 终端 WebSocket 集成验证

- 终端会话 ready 事件测试
  结果：通过
- 终端输出写入与 backlog 回放测试
  结果：通过
- 终端断线重连后继续附着测试
  结果：通过
- 非法终端 payload 错误事件测试
  结果：通过

本轮成功生成的示例实体：

- `projectId`: `69c7550ac32ccabb165a1c35`
- `sessionId`: `69c7550ac32ccabb165a1c36`
- `messageId`: `69c7550ac32ccabb165a1c37`
- `runId`: `69c7550ac32ccabb165a1c39`

## 4. 结论

当前版本已经不是单纯的工程骨架，而是一版可运行、可联调、可继续扩展的 alpha 基础版本。项目已经具备：

- 完整的前后端工程结构
- MongoDB 持久化
- 统一会话和消息基础模型
- WebSocket 实时消息链路
- 替身 AI Agent 的启动与停止骨架
- 文件树与基础文本编辑器
- 浏览器终端
- Git 状态、diff、暂存/提交、分支切换/创建基础能力
- 替身 AI Agent 最小审批流
- 替身 AI Agent 人工接管与恢复运行基础能力
- 替身 AI Agent 运行检查点、审计事件与检查点级恢复能力
- WebSocket 自动重连与状态回补基础能力
- WebSocket 订阅与项目事件回推集成测试
- 终端 WebSocket 重连与 backlog 回放集成测试
- `provider-core` 统一 Provider 适配层
- Claude 真实 Provider 首条链路
- Codex 真实 Provider 首条链路
- Gemini 真实 Provider 首条链路
- 真实 Provider 失败场景基础测试

## 5. 已知缺口

- 真实 Provider 当前已接入 Claude、Codex 和 Gemini，Cursor 仍未接入，但底层适配层已统一抽离
- Git 能力已支持本地提交和分支切换，尚未支持远程操作
- 插件、任务系统尚未实现
- 替身 AI Agent 尚未实现更细粒度风险策略和运行回放
- 自动化测试已补 API、状态机、实时 WebSocket 与终端 WebSocket 协议层首条集成覆盖，但更复杂运行恢复场景仍偏基础
- 真实 Provider 已补首轮失败场景测试，但尚未完成带真实凭证的在线联调记录

## 6. 下一步测试建议

- 增加 API 集成测试
- 增加 MongoDB repository 层测试
- 增加替身 AI Agent 状态机测试
- 增加审批流接口与页面联调测试
- 增加真实 Claude 联调报告
- 增加真实 Codex 联调报告

## 7. 2026-03-29 补充验证

补充验证命令：

- `npm run check`

补充结果：

- 结果：通过
- 当前共 `37` 个测试文件、`83` 个测试用例
- 前后端 `lint`、`typecheck`、`test`、`build` 全链路通过

本轮新增覆盖重点：

- CLI 历史会话导入、恢复与继续执行
- Claude / Codex Settings、MCP 与工具权限写回
- Git fetch / pull / push 远程同步
- 多终端标签与重连回补
- 插件安装、宿主上下文、本地 manifest 与受控动作执行
- 任务工作台与 TaskMaster 只读摘要

更新后的已知缺口：

- `cursor` 近阶段仍不作为集成目标
- Gemini Settings、MCP 与工具权限仍是只读摘要，尚未支持写回
- 插件运行时当前仍是受控模式，尚未开放外部插件后端或更细粒度权限分级
- 任务工作台当前仍为只读骨架，尚未落地内建任务持久化或 TaskMaster 双向同步
- Web 构建已通过，但前端主包体积偏大，后续需要做分包优化
