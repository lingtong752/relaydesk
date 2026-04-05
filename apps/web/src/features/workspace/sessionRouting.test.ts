import { describe, expect, it } from "vitest";
import type { SessionRecord } from "@shared";
import {
  buildWorkspaceChatPath,
  buildWorkspaceToolPath,
  findBoundSessionBySearch,
  getSessionIdFromSearch
} from "./sessionRouting";

function createSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "session-1",
    projectId: "project-1",
    provider: "mock",
    title: "session",
    origin: "relaydesk",
    runtimeMode: "api_mode",
    status: "idle",
    createdAt: "2026-04-05T08:00:00.000Z",
    updatedAt: "2026-04-05T08:00:00.000Z",
    ...overrides
  };
}

describe("sessionRouting", () => {
  it("builds chat and tool routes with optional session id", () => {
    expect(buildWorkspaceChatPath("project-demo")).toBe("/workspace/project-demo/chat");
    expect(
      buildWorkspaceToolPath({
        projectId: "project-demo",
        tool: "terminal",
        sessionId: "session-123"
      })
    ).toBe("/workspace/project-demo/tools/terminal?sessionId=session-123");
    expect(
      buildWorkspaceToolPath({
        projectId: "project-demo",
        tool: "files",
        sessionId: ""
      })
    ).toBe("/workspace/project-demo/tools/files");
  });

  it("extracts and resolves bound session id from search params", () => {
    const sessions = [
      createSession({ id: "session-a" }),
      createSession({ id: "session-b" })
    ];

    expect(getSessionIdFromSearch("?sessionId=session-a")).toBe("session-a");
    expect(getSessionIdFromSearch("?sessionId=")).toBeUndefined();
    expect(getSessionIdFromSearch("?foo=bar")).toBeUndefined();

    expect(findBoundSessionBySearch(sessions, "?sessionId=session-b")?.id).toBe("session-b");
    expect(findBoundSessionBySearch(sessions, "?sessionId=missing")).toBeNull();
  });
});
