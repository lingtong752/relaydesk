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

export function findBoundSessionBySearch(
  sessions: SessionRecord[],
  search: string
): SessionRecord | null {
  const sessionId = getSessionIdFromSearch(search);
  if (!sessionId) {
    return null;
  }

  return sessions.find((session) => session.id === sessionId) ?? null;
}
