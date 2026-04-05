import { describe, expect, it } from "vitest";
import type { DiscoveredProjectRecord, ProjectRecord, SessionRecord } from "@shared";
import {
  buildSessionCapabilitiesMap,
  linkDiscoveredProjects,
  resolveActiveSessionId
} from "./projectRouteState.js";

describe("projectRouteState", () => {
  it("links discovered projects by normalized root path", () => {
    const discovered: DiscoveredProjectRecord[] = [
      {
        id: "discovered-1",
        name: "demo",
        rootPath: "/Users/test/demo",
        providers: ["claude"],
        sessionCount: 1,
        sessions: []
      }
    ];
    const projects: ProjectRecord[] = [
      {
        id: "project-1",
        ownerId: "owner-1",
        name: "relaydesk-demo",
        rootPath: "/Users/test/demo/",
        providerPreferences: ["mock"],
        createdAt: "2026-04-05T00:00:00.000Z",
        updatedAt: "2026-04-05T00:00:00.000Z"
      }
    ];

    const linked = linkDiscoveredProjects(discovered, projects);
    expect(linked[0]).toEqual(
      expect.objectContaining({
        linkedProjectId: "project-1",
        linkedProjectName: "relaydesk-demo"
      })
    );
  });

  it("selects active session id by run session, reconnecting, running, then first", () => {
    const sessions: Array<Pick<SessionRecord, "id" | "status">> = [
      { id: "session-idle", status: "idle" },
      { id: "session-reconnecting", status: "reconnecting" },
      { id: "session-running", status: "running" }
    ];

    expect(
      resolveActiveSessionId({
        sessions,
        activeRunSessionId: "session-running"
      })
    ).toBe("session-running");

    expect(
      resolveActiveSessionId({
        sessions,
        activeRunSessionId: "session-missing"
      })
    ).toBe("session-reconnecting");

    expect(
      resolveActiveSessionId({
        sessions: [{ id: "session-running", status: "running" }],
        activeRunSessionId: null
      })
    ).toBe("session-running");

    expect(
      resolveActiveSessionId({
        sessions: [{ id: "session-idle", status: "idle" }],
        activeRunSessionId: null
      })
    ).toBe("session-idle");
  });

  it("builds capabilities map with fallback values", () => {
    const sessions: SessionRecord[] = [
      {
        id: "session-1",
        projectId: "project-1",
        provider: "mock",
        title: "session one",
        origin: "relaydesk",
        runtimeMode: "api_mode",
        status: "idle",
        capabilities: {
          canSendMessages: true,
          canResume: false,
          canStartRuns: true,
          canAttachTerminal: true
        },
        createdAt: "2026-04-05T00:00:00.000Z",
        updatedAt: "2026-04-05T00:00:00.000Z"
      },
      {
        id: "session-2",
        projectId: "project-1",
        provider: "codex",
        title: "session two",
        origin: "imported_cli",
        runtimeMode: "cli_session_mode",
        status: "idle",
        createdAt: "2026-04-05T00:00:00.000Z",
        updatedAt: "2026-04-05T00:00:00.000Z"
      }
    ];

    const map = buildSessionCapabilitiesMap(sessions);
    expect(map["session-1"]).toEqual({
      canSendMessages: true,
      canResume: false,
      canStartRuns: true,
      canAttachTerminal: true
    });
    expect(map["session-2"]).toEqual({
      canSendMessages: false,
      canResume: false,
      canStartRuns: false,
      canAttachTerminal: false
    });
  });
});
