import {
  canResumeImportedCliProvider,
  type SessionRecord
} from "@shared";

type SessionCapabilities = NonNullable<SessionRecord["capabilities"]>;

function createEmptyCapabilities(): SessionCapabilities {
  return {
    canSendMessages: false,
    canResume: false,
    canStartRuns: false,
    canAttachTerminal: false
  };
}

function isImportedResumableSession(session: SessionRecord): boolean {
  return session.origin === "imported_cli" && canResumeImportedCliProvider(session.provider);
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

export function getSessionOriginHistoryLabel(
  session: Pick<SessionRecord, "origin"> | null
): string {
  return session?.origin === "imported_cli" ? "CLI 历史会话" : "RelayDesk 会话";
}

export function getSessionOriginCreationLabel(
  session: Pick<SessionRecord, "origin">
): string {
  return session.origin === "imported_cli" ? "CLI 导入" : "RelayDesk 创建";
}

export function getSessionOriginRuntimeLabelByOrigin(
  origin: SessionRecord["origin"]
): string {
  return origin === "imported_cli" ? "原生 CLI session" : "RelayDesk 托管会话";
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
    return getSessionOriginRuntimeLabelByOrigin("imported_cli");
  }

  return getSessionOriginRuntimeLabelByOrigin("relaydesk");
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
