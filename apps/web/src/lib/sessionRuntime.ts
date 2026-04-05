import type { SessionRecord } from "@shared";

type SessionCapabilities = NonNullable<SessionRecord["capabilities"]>;
const RESUMABLE_IMPORTED_PROVIDERS = new Set<SessionRecord["provider"]>([
  "claude",
  "codex",
  "gemini"
]);

function createEmptyCapabilities(): SessionCapabilities {
  return {
    canSendMessages: false,
    canResume: false,
    canStartRuns: false,
    canAttachTerminal: false
  };
}

function isImportedResumableSession(session: SessionRecord): boolean {
  return session.origin === "imported_cli" && RESUMABLE_IMPORTED_PROVIDERS.has(session.provider);
}

function formatZhCnTimestamp(value: string): string {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function buildFallbackCapabilities(session: SessionRecord): SessionCapabilities {
  const importedResumable = isImportedResumableSession(session);

  return {
    canSendMessages: session.origin === "relaydesk" || importedResumable,
    canResume: importedResumable,
    canStartRuns: session.origin === "relaydesk" || importedResumable,
    canAttachTerminal: true
  };
}

export function getSessionCapabilities(session: SessionRecord | null): SessionCapabilities {
  if (!session) {
    return createEmptyCapabilities();
  }

  return session.capabilities ?? buildFallbackCapabilities(session);
}

export function getSessionRuntimeMode(session: SessionRecord | null): string {
  if (!session) {
    return "api_mode";
  }

  return session.runtimeMode ?? (session.origin === "imported_cli" ? "cli_session_mode" : "api_mode");
}

export function getSessionResumeStatusLabel(session: SessionRecord | null): string | null {
  if (!session?.lastResumeStatus) {
    return null;
  }

  if (session.lastResumeStatus === "succeeded") {
    return session.lastResumedAt
      ? `最近恢复成功：${formatZhCnTimestamp(session.lastResumedAt)}`
      : "最近恢复成功";
  }

  if (session.lastResumeStatus === "aborted") {
    return session.lastResumeAttemptAt
      ? `最近恢复已中止：${formatZhCnTimestamp(session.lastResumeAttemptAt)}`
      : "最近恢复已中止";
  }

  return session.lastResumeError
    ? `最近恢复失败：${session.lastResumeError}`
    : "最近恢复失败";
}

export function getSessionOriginRuntimeLabel(session: SessionRecord): string {
  if (getSessionRuntimeMode(session) === "cli_session_mode") {
    return "原生 CLI session";
  }

  return "RelayDesk 托管会话";
}

export function getSessionStatusLabel(session: SessionRecord | null): string {
  if (!session) {
    return "未知";
  }

  if (session.status === "running") {
    return "运行中";
  }

  if (session.status === "reconnecting") {
    return "恢复中";
  }

  if (session.status === "failed") {
    return "失败";
  }

  if (session.status === "stopped") {
    return "已停止";
  }

  return "空闲";
}
