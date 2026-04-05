import path from "node:path";
import type {
  DiscoveredProjectRecord,
  ProjectRecord,
  SessionCapabilitiesMapRecord,
  SessionRecord
} from "@shared";

const FALLBACK_SESSION_CAPABILITIES: NonNullable<SessionRecord["capabilities"]> = {
  canSendMessages: false,
  canResume: false,
  canStartRuns: false,
  canAttachTerminal: false
};

function normalizeComparablePath(rootPath: string): string {
  return path.resolve(rootPath.trim());
}

export function linkDiscoveredProjects(
  discoveredProjects: DiscoveredProjectRecord[],
  projects: ProjectRecord[]
): DiscoveredProjectRecord[] {
  const projectIndex = new Map(
    projects.map((project) => [normalizeComparablePath(project.rootPath), project] as const)
  );

  return discoveredProjects.map((project) => {
    const linkedProject = projectIndex.get(normalizeComparablePath(project.rootPath));
    return {
      ...project,
      linkedProjectId: linkedProject?.id ?? null,
      linkedProjectName: linkedProject?.name ?? null
    };
  });
}

export function resolveActiveSessionId(input: {
  sessions: Array<Pick<SessionRecord, "id" | "status">>;
  activeRunSessionId: string | null;
}): string | null {
  if (input.activeRunSessionId && input.sessions.some((session) => session.id === input.activeRunSessionId)) {
    return input.activeRunSessionId;
  }

  const reconnectingSession = input.sessions.find((session) => session.status === "reconnecting");
  if (reconnectingSession) {
    return reconnectingSession.id;
  }

  const runningSession = input.sessions.find((session) => session.status === "running");
  if (runningSession) {
    return runningSession.id;
  }

  return input.sessions[0]?.id ?? null;
}

export function buildSessionCapabilitiesMap(
  sessions: SessionRecord[]
): SessionCapabilitiesMapRecord {
  return Object.fromEntries(
    sessions.map((session) => [session.id, session.capabilities ?? FALLBACK_SESSION_CAPABILITIES])
  );
}
