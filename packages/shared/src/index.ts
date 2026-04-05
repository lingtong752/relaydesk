export type ProviderId = "mock" | "claude" | "codex" | "cursor" | "gemini";
export type SessionRuntimeMode = "api_mode" | "cli_session_mode";
export type SessionResumeStatus = "succeeded" | "failed" | "aborted";
export type SessionStatus = "idle" | "running" | "reconnecting" | "stopped" | "failed";

export type MessageRole = "human" | "surrogate" | "provider" | "system" | "tool";
export type MessageStatus = "pending" | "streaming" | "completed" | "stopped" | "failed";
export type RunStatus =
  | "draft"
  | "running"
  | "waiting_human"
  | "paused"
  | "stopped"
  | "completed"
  | "failed";

export interface AuthUser {
  id: string;
  email: string;
  createdAt: string;
}

export interface ProjectRecord {
  id: string;
  ownerId: string;
  name: string;
  rootPath: string;
  providerPreferences: ProviderId[];
  createdAt: string;
  updatedAt: string;
}

export type PluginSourceType = "builtin" | "local" | "git";
export type PluginFrontendComponentId = "project_pulse" | "delivery_radar";
export type PluginFrontendRenderMode = "builtin" | "local_bundle" | "git_bundle";
export type PluginBackendServiceKind = "none" | "context_snapshot" | "rpc_bridge";
export const RELAYDESK_PLUGIN_HOST_API_VERSION = "1.0";
export type PluginActionPermission =
  | "read_project"
  | "write_project"
  | "execute_command"
  | "read_host_context"
  | "read_audit"
  | "manage_git";
export type PluginRpcHandlerId =
  | "get_context_snapshot"
  | "list_recent_audit_events"
  | "list_task_board"
  | "read_workspace_file";

export interface PluginActionInputRecord {
  name: string;
  label: string;
  description?: string;
  placeholder?: string;
  required: boolean;
  defaultValue?: string;
}

export interface PluginActionRecord {
  id: string;
  label: string;
  description: string;
  command: string;
  args: string[];
  inputs: PluginActionInputRecord[];
  permissions: PluginActionPermission[];
  timeoutMs?: number;
}

export interface PluginRpcMethodRecord {
  id: string;
  label: string;
  description: string;
  handler: PluginRpcHandlerId;
  inputs: PluginActionInputRecord[];
  permissions: PluginActionPermission[];
}

export interface PluginFrontendRecord {
  type: PluginFrontendRenderMode;
  apiVersion: string;
  displayName: string;
  builtinComponent?: PluginFrontendComponentId;
  entry?: string | null;
}

export interface PluginActionExecutionRecord {
  pluginId: string;
  actionId: string;
  command: string;
  args: string[];
  cwd: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  success: boolean;
  timedOut: boolean;
  durationMs: number;
  executedAt: string;
}

export interface PluginRpcExecutionRecord {
  pluginId: string;
  rpcMethodId: string;
  handler: PluginRpcHandlerId;
  success: boolean;
  durationMs: number;
  executedAt: string;
  result: Record<string, unknown> | null;
  error?: string | null;
}

export interface PluginExecutionHistoryRecord {
  id: string;
  pluginId: string;
  executionKind: "action" | "rpc";
  title: string;
  summary: string;
  success: boolean;
  durationMs: number;
  executedAt: string;
  actionId?: string;
  rpcMethodId?: string;
  details?: Record<string, unknown>;
}

export interface PluginCatalogRecord {
  id: string;
  sourceType: PluginSourceType;
  sourceRef?: string | null;
  sourceVersion?: string | null;
  name: string;
  version: string;
  description: string;
  capabilities: string[];
  tabTitle: string;
  routeSegment: string;
  frontend: PluginFrontendRecord;
  frontendComponent: PluginFrontendComponentId;
  backendService: PluginBackendServiceKind;
  actions: PluginActionRecord[];
  rpcMethods: PluginRpcMethodRecord[];
}

export interface PluginInstallationRecord extends PluginCatalogRecord {
  installationId: string;
  projectId: string;
  sourceRef?: string | null;
  sourceVersion?: string | null;
  enabled: boolean;
  installedAt: string;
  updatedAt: string;
}

export interface PluginFrontendModuleRecord {
  installation: PluginInstallationRecord;
  frontend: PluginInstallationRecord["frontend"];
  entryPath: string;
  code: string;
  integrity: string;
  hostApiVersion: string;
}

export interface PluginPreviewDiffRecord {
  hasChanges: boolean;
  changedFields: Array<
    | "name"
    | "version"
    | "description"
    | "tabTitle"
    | "routeSegment"
    | "frontendComponent"
    | "backendService"
    | "sourceType"
    | "sourceRef"
    | "sourceVersion"
  >;
  addedCapabilities: string[];
  removedCapabilities: string[];
  addedPermissions: PluginActionPermission[];
  removedPermissions: PluginActionPermission[];
  addedActions: string[];
  removedActions: string[];
  changedActions: string[];
  addedRpcMethods: string[];
  removedRpcMethods: string[];
  changedRpcMethods: string[];
}

export type ProviderSettingsStatus = "configured" | "partial" | "not_found";

export interface CliConfigSourceRecord {
  label: string;
  path: string;
  scope: "global" | "project";
  exists: boolean;
}

export interface CliMcpServerRecord {
  provider: ProviderId;
  name: string;
  scope: "global" | "project";
  sourcePath: string;
  transport: "stdio" | "http" | "sse" | "unknown";
  command?: string;
  url?: string;
  enabled?: boolean;
}

export interface ProviderSettingsRecord {
  provider: ProviderId;
  status: ProviderSettingsStatus;
  summary: string;
  sources: CliConfigSourceRecord[];
  model?: string | null;
  reasoningEffort?: string | null;
  approvalPolicy?: string | null;
  sandboxMode?: string | null;
  toolPermissionMode?: string | null;
  allowedTools: string[];
  disallowedTools: string[];
  mcpServers: CliMcpServerRecord[];
  notes: string[];
}

export interface ProjectSettingsSummary {
  projectId: string;
  projectRootPath: string;
  providers: ProviderSettingsRecord[];
  collectedAt: string;
}

export interface ProjectSettingsUpdateInput {
  provider: "claude" | "codex" | "gemini";
  model?: string | null;
  reasoningEffort?: string | null;
  approvalPolicy?: string | null;
  sandboxMode?: string | null;
  allowedTools?: string[];
  disallowedTools?: string[];
  mcpServers?: CliMcpServerRecord[];
}

export interface DiscoveredSessionRecord {
  id: string;
  provider: ProviderId;
  summary: string;
  sourcePath: string;
  lastActivity?: string;
}

export interface DiscoveredProjectRecord {
  id: string;
  name: string;
  rootPath: string;
  providers: ProviderId[];
  sessionCount: number;
  lastActivity?: string;
  linkedProjectId?: string | null;
  linkedProjectName?: string | null;
  sessions: DiscoveredSessionRecord[];
}

export interface SessionRecord {
  id: string;
  projectId: string;
  provider: ProviderId;
  title: string;
  origin: "relaydesk" | "imported_cli";
  externalSessionId?: string;
  sourcePath?: string;
  runtimeMode?: SessionRuntimeMode;
  capabilities?: SessionCapabilitiesRecord;
  status: SessionStatus;
  lastResumeAttemptAt?: string;
  lastResumedAt?: string;
  lastResumeStatus?: SessionResumeStatus;
  lastResumeError?: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt?: string;
}

export interface SessionCapabilitiesRecord {
  canSendMessages: boolean;
  canResume: boolean;
  canStartRuns: boolean;
  canAttachTerminal: boolean;
}

export type SessionCapabilitiesMapRecord = Record<string, SessionCapabilitiesRecord>;

export interface MessageRecord {
  id: string;
  sessionId: string;
  projectId: string;
  role: MessageRole;
  senderType: "user" | "surrogate" | "provider" | "system";
  provider?: ProviderId;
  content: string;
  status: MessageStatus;
  createdAt: string;
  updatedAt: string;
}

export interface RunRecord {
  id: string;
  projectId: string;
  sessionId: string;
  provider: ProviderId;
  objective: string;
  constraints: string;
  status: RunStatus;
  startedAt: string;
  updatedAt: string;
  stoppedAt?: string;
}

export interface ProjectBootstrapRecord {
  project: ProjectRecord;
  sessions: SessionRecord[];
  activeSessionId: string | null;
  sessionCapabilities: SessionCapabilitiesMapRecord;
  recentSessionAuditEvents: AuditEventRecord[];
  activeRun: RunRecord | null;
  latestRun: RunRecord | null;
  pendingApprovals: ApprovalRecord[];
}

export interface ApprovalRecord {
  id: string;
  projectId: string;
  sessionId: string;
  runId: string;
  title: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

export type AuditActorType = "user" | "system" | "surrogate" | "provider";

export interface AuditEventRecord {
  id: string;
  projectId: string;
  sessionId?: string;
  runId?: string;
  eventType: string;
  actorType: AuditActorType;
  summary: string;
  payload?: Record<string, unknown>;
  createdAt: string;
}

export interface RunCheckpointRecord {
  id: string;
  projectId: string;
  sessionId: string;
  runId: string;
  runStatus: RunStatus;
  source: string;
  summary: string;
  messageId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface PluginHostContextRecord {
  projectId: string;
  projectName: string;
  projectRootPath: string;
  activeProviders: ProviderId[];
  sessionCount: number;
  importedSessionCount: number;
  pendingApprovalCount: number;
  latestSessions: SessionRecord[];
  activeRun: RunRecord | null;
  latestRun: RunRecord | null;
}

export type ProjectTaskSourceType = "taskmaster" | "relaydesk";
export type ProjectTaskStatus = "todo" | "in_progress" | "done" | "blocked" | "unknown";
export type ProjectDocumentReferenceType = "prd" | "roadmap" | "backlog" | "test_report";
export type ProjectTaskTimelineEventType =
  | "synced"
  | "status_changed"
  | "note_updated"
  | "blocked_reason_updated"
  | "assignee_updated"
  | "session_bound"
  | "run_started";

export interface ProjectDocumentReferenceRecord {
  id: string;
  label: string;
  type: ProjectDocumentReferenceType;
  path: string;
  exists: boolean;
  updatedAt?: string | null;
}

export interface ProjectTaskRecord {
  id: string;
  sourceType: ProjectTaskSourceType;
  title: string;
  status: ProjectTaskStatus;
  priority?: string | null;
  summary?: string | null;
  parentId?: string | null;
  nestingLevel: number;
  sourcePath?: string | null;
  assignee?: string | null;
  notes?: string | null;
  blockedReason?: string | null;
  boundSessionId?: string | null;
  boundRunId?: string | null;
  timeline: ProjectTaskTimelineEventRecord[];
  updatedAt?: string | null;
}

export interface ProjectTaskTimelineEventRecord {
  id: string;
  type: ProjectTaskTimelineEventType;
  summary: string;
  detail?: string | null;
  createdAt: string;
}

export interface ProjectTaskStatusCounts {
  todo: number;
  inProgress: number;
  done: number;
  blocked: number;
  unknown: number;
}

export interface TaskMasterSummaryRecord {
  available: boolean;
  sourcePath?: string | null;
  sourceUpdatedAt?: string | null;
  syncToken?: string | null;
  scannedPaths: string[];
  taskCount: number;
  counts: ProjectTaskStatusCounts;
  notes: string[];
}

export interface ProjectTaskBoardRecord {
  projectId: string;
  projectRootPath: string;
  collectedAt: string;
  documents: ProjectDocumentReferenceRecord[];
  tasks: ProjectTaskRecord[];
  taskMaster: TaskMasterSummaryRecord;
}

export interface WorkspaceFileEntry {
  name: string;
  path: string;
  kind: "file" | "directory";
  size: number | null;
  updatedAt: string;
}

export interface WorkspaceFileContent {
  path: string;
  content: string;
  updatedAt: string;
}

export interface TerminalSourceSessionRecord {
  id: string;
  title: string;
  provider: ProviderId;
  origin: SessionRecord["origin"];
  runtimeMode?: SessionRuntimeMode;
}

export type TerminalBackendType = "shell" | "provider_cli";
export type TerminalAttachMode = "direct_shell" | "live_attach" | "resume_bridge";

export interface TerminalSessionRecord {
  id: string;
  projectId: string;
  cwd: string;
  shell: string;
  backendType: TerminalBackendType;
  provider?: ProviderId;
  attachMode?: TerminalAttachMode;
  supportsInput: boolean;
  supportsResize: boolean;
  fallbackReason?: string | null;
  sourceSession?: TerminalSourceSessionRecord;
  createdAt: string;
}

export interface GitChangedFileRecord {
  path: string;
  stagedStatus: string;
  unstagedStatus: string;
  summary: string;
}

export interface GitStatusRecord {
  available: boolean;
  rootPath: string;
  branch: string | null;
  ahead: number;
  behind: number;
  dirty: boolean;
  files: GitChangedFileRecord[];
}

export interface GitBranchRecord {
  name: string;
  current: boolean;
}

export interface GitRemoteRecord {
  name: string;
  fetchUrl: string | null;
  pushUrl: string | null;
}

export interface GitDiffRecord {
  available: boolean;
  path: string;
  diff: string;
  isUntracked: boolean;
  notice?: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export const BUILTIN_PLUGIN_CATALOG: PluginCatalogRecord[] = [
  {
    id: "project-pulse",
    sourceType: "builtin",
    sourceRef: null,
    sourceVersion: null,
    name: "Project Pulse",
    version: "0.1.0",
    description: "把项目会话、Provider 分布和替身运行状态收口到一个插件视图里。",
    capabilities: ["summary", "sessions", "providers", "runs"],
    tabTitle: "Project Pulse",
    routeSegment: "pulse",
    frontend: {
      type: "builtin",
      apiVersion: "1.0",
      displayName: "Project Pulse",
      builtinComponent: "project_pulse",
      entry: null
    },
    frontendComponent: "project_pulse",
    backendService: "context_snapshot",
    actions: [],
    rpcMethods: [
      {
        id: "context-snapshot",
        label: "读取宿主快照",
        description: "获取当前项目的会话、运行与审批快照。",
        handler: "get_context_snapshot",
        inputs: [],
        permissions: ["read_host_context"]
      },
      {
        id: "task-board",
        label: "读取任务看板",
        description: "读取当前项目的 TaskMaster 与任务工作台摘要。",
        handler: "list_task_board",
        inputs: [],
        permissions: ["read_project"]
      }
    ]
  },
  {
    id: "delivery-radar",
    sourceType: "builtin",
    sourceRef: null,
    sourceVersion: null,
    name: "Delivery Radar",
    version: "0.1.0",
    description: "聚焦待审批项、运行节奏和最近会话，适合快速判断下一步动作。",
    capabilities: ["approvals", "activity", "runs"],
    tabTitle: "Delivery Radar",
    routeSegment: "radar",
    frontend: {
      type: "builtin",
      apiVersion: "1.0",
      displayName: "Delivery Radar",
      builtinComponent: "delivery_radar",
      entry: null
    },
    frontendComponent: "delivery_radar",
    backendService: "context_snapshot",
    actions: [],
    rpcMethods: [
      {
        id: "context-snapshot",
        label: "读取宿主快照",
        description: "获取当前项目的会话、运行与审批快照。",
        handler: "get_context_snapshot",
        inputs: [],
        permissions: ["read_host_context"]
      },
      {
        id: "recent-audit-events",
        label: "读取最近审计事件",
        description: "拉取最近的项目审计事件，便于做节奏判断。",
        handler: "list_recent_audit_events",
        inputs: [
          {
            name: "limit",
            label: "数量",
            description: "返回最近多少条事件，默认 10。",
            placeholder: "10",
            required: false,
            defaultValue: "10"
          }
        ],
        permissions: ["read_audit"]
      }
    ]
  }
];

export interface RealtimeEventMap {
  "session.subscribed": { channel: string };
  "message.created": { message: MessageRecord };
  "message.delta": { messageId: string; delta: string };
  "message.completed": { message: MessageRecord };
  "run.updated": { run: RunRecord };
  "approval.updated": { approval: ApprovalRecord };
  error: { message: string };
}

export type RealtimeEvent = {
  [K in keyof RealtimeEventMap]: {
    type: K;
    payload: RealtimeEventMap[K];
  };
}[keyof RealtimeEventMap];

export interface WebSocketClientMessage {
  type: "subscribe";
  channel: string;
}
