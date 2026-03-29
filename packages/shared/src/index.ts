export type ProviderId = "mock" | "claude" | "codex" | "cursor" | "gemini";

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

export type PluginSourceType = "builtin" | "local";
export type PluginFrontendComponentId = "project_pulse" | "delivery_radar";
export type PluginBackendServiceKind = "none" | "context_snapshot";
export type PluginActionPermission = "read_project" | "write_project";

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

export interface PluginCatalogRecord {
  id: string;
  sourceType: PluginSourceType;
  sourceRef?: string | null;
  name: string;
  version: string;
  description: string;
  capabilities: string[];
  tabTitle: string;
  routeSegment: string;
  frontendComponent: PluginFrontendComponentId;
  backendService: PluginBackendServiceKind;
  actions: PluginActionRecord[];
}

export interface PluginInstallationRecord extends PluginCatalogRecord {
  installationId: string;
  projectId: string;
  sourceRef?: string | null;
  enabled: boolean;
  installedAt: string;
  updatedAt: string;
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
  provider: "claude" | "codex";
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
  status: "idle" | "running" | "stopped";
  createdAt: string;
  updatedAt: string;
  lastMessageAt?: string;
}

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
  updatedAt?: string | null;
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

export interface TerminalSessionRecord {
  id: string;
  projectId: string;
  cwd: string;
  shell: string;
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
    name: "Project Pulse",
    version: "0.1.0",
    description: "把项目会话、Provider 分布和替身运行状态收口到一个插件视图里。",
    capabilities: ["summary", "sessions", "providers", "runs"],
    tabTitle: "Project Pulse",
    routeSegment: "pulse",
    frontendComponent: "project_pulse",
    backendService: "context_snapshot",
    actions: []
  },
  {
    id: "delivery-radar",
    sourceType: "builtin",
    sourceRef: null,
    name: "Delivery Radar",
    version: "0.1.0",
    description: "聚焦待审批项、运行节奏和最近会话，适合快速判断下一步动作。",
    capabilities: ["approvals", "activity", "runs"],
    tabTitle: "Delivery Radar",
    routeSegment: "radar",
    frontendComponent: "delivery_radar",
    backendService: "context_snapshot",
    actions: []
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
