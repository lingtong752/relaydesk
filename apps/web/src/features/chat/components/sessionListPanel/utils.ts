import type { SessionRecord } from "@shared";

export type SessionPanelTab = "projects" | "conversations";

export function getSessionActivityAt(session: SessionRecord): number {
  const timestamp = Date.parse(session.lastMessageAt ?? session.updatedAt ?? session.createdAt);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function getSelectedSessionActivityAt(
  sessions: SessionRecord[],
  selectedSessionId: string
): number {
  const selectedSession = sessions.find((session) => session.id === selectedSessionId);
  return selectedSession ? getSessionActivityAt(selectedSession) : 0;
}

export function hasUnreadActivity(
  session: SessionRecord,
  selectedSessionId: string,
  selectedSessionActivityAt: number
): boolean {
  if (session.id === selectedSessionId) {
    return false;
  }

  return getSessionActivityAt(session) > selectedSessionActivityAt;
}

export function getSessionPriority(
  session: SessionRecord,
  selectedSessionId: string,
  selectedSessionActivityAt: number
): number {
  if (session.status === "running") {
    return 3;
  }

  if (session.status === "reconnecting") {
    return 2;
  }

  if (hasUnreadActivity(session, selectedSessionId, selectedSessionActivityAt)) {
    return 1;
  }

  return 0;
}

export function sortSessionsForPanel(
  sessions: SessionRecord[],
  selectedSessionId: string,
  selectedSessionActivityAt: number
): SessionRecord[] {
  return [...sessions].sort((left, right) => {
    const priorityDiff =
      getSessionPriority(right, selectedSessionId, selectedSessionActivityAt) -
      getSessionPriority(left, selectedSessionId, selectedSessionActivityAt);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    return getSessionActivityAt(right) - getSessionActivityAt(left);
  });
}

export function filterSessionsByKeyword(
  sessions: SessionRecord[],
  keyword: string
): SessionRecord[] {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) {
    return sessions;
  }

  return sessions.filter((session) =>
    `${session.title} ${session.provider} ${session.origin}`
      .toLowerCase()
      .includes(normalizedKeyword)
  );
}
