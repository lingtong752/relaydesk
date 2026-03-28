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
  结果：通过，当前共 7 个测试文件、17 个测试用例

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
- Git 状态与 diff 视图
- 替身 AI Agent 最小审批流
- 替身 AI Agent 人工接管与恢复运行基础能力
- WebSocket 自动重连与状态回补基础能力
- Claude 真实 Provider 首条链路
- Codex 真实 Provider 首条链路

## 5. 已知缺口

- 真实 Provider 当前已接入 Claude 和 Codex，Cursor、Gemini 仍未接入
- Git 能力仅实现只读基础版，尚未支持提交、分支和远程操作
- 插件、任务系统尚未实现
- 替身 AI Agent 尚未实现检查点恢复和更细粒度风险策略
- 自动化测试仍偏基础，尚未覆盖 API 集成和替身状态机

## 6. 下一步测试建议

- 增加 API 集成测试
- 增加 MongoDB repository 层测试
- 增加替身 AI Agent 状态机测试
- 增加审批流接口与页面联调测试
- 增加真实 Claude 联调报告
- 增加真实 Codex 联调报告
