import type { SessionRecord } from "@shared";

export type WorkspaceToolTab = "terminal" | "files" | "git";

export function buildWorkspaceChatPath(projectId: string): string {
  return `/workspace/${projectId}/chat`;
}

export function buildWorkspaceToolPath(input: {
  projectId: string;
  tool: WorkspaceToolTab;
  sessionId?: string | null;
}): string {
  const basePath = `/workspace/${input.projectId}/tools/${input.tool}`;
  const normalizedSessionId = input.sessionId?.trim();
  if (!normalizedSessionId) {
    return basePath;
  }

  const query = new URLSearchParams({ sessionId: normalizedSessionId });
  return `${basePath}?${query.toString()}`;
}

export function getSessionIdFromSearch(search: string): string | undefined {
  const sessionId = new URLSearchParams(search).get("sessionId")?.trim();
  return sessionId ? sessionId : undefined;
}

function findSessionById(
  sessions: SessionRecord[],
  sessionId: string | undefined
): SessionRecord | null {
  if (!sessionId) {
    return null;
  }

  return sessions.find((session) => session.id === sessionId) ?? null;
}

export function resolveWorkspaceToolSessionId(input: {
  sessions: SessionRecord[];
  search: string;
  selectedSessionId?: string | null;
}): string | undefined {
  const byQuery = getSessionIdFromSearch(input.search);
  if (findSessionById(input.sessions, byQuery)) {
    return byQuery;
  }

  const normalizedSelectedSessionId = input.selectedSessionId?.trim();
  if (findSessionById(input.sessions, normalizedSelectedSessionId)) {
    return normalizedSelectedSessionId;
  }

  return undefined;
}

export function resolveWorkspaceToolSession(input: {
  sessions: SessionRecord[];
  search: string;
  selectedSessionId?: string | null;
}): SessionRecord | null {
  return findSessionById(
    input.sessions,
    resolveWorkspaceToolSessionId(input)
  );
}

export function findBoundSessionBySearch(
  sessions: SessionRecord[],
  search: string
): SessionRecord | null {
  return resolveWorkspaceToolSession({
    sessions,
    search
  });
}
