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

export interface SessionRecord {
  id: string;
  projectId: string;
  provider: ProviderId;
  title: string;
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
