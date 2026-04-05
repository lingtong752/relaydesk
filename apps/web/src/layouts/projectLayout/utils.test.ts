import { describe, expect, it } from "vitest";
import type { SessionRecord } from "@shared";
import {
  getConnectionStatusLabel,
  getGroupLabel,
  getSessionActivityAt,
  getStorageKey
} from "./utils";

function createSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "session-1",
    projectId: "project-1",
    provider: "mock",
    title: "session",
    origin: "relaydesk",
    runtimeMode: "api_mode",
    status: "idle",
    createdAt: "2026-04-05T09:00:00.000Z",
    updatedAt: "2026-04-05T10:00:00.000Z",
    capabilities: {
      canSendMessages: true,
      canResume: false,
      canStartRuns: true,
      canAttachTerminal: true
    },
    ...overrides
  };
}

describe("project layout utils", () => {
  it("maps realtime connection states to display labels", () => {
    expect(getConnectionStatusLabel("connected")).toBe("实时连接正常");
    expect(getConnectionStatusLabel("reconnecting")).toBe("正在恢复实时连接");
    expect(getConnectionStatusLabel("connecting")).toBe("正在建立实时连接");
    expect(getConnectionStatusLabel("disconnected")).toBe("实时连接已断开");
  });

  it("builds stable storage keys", () => {
    expect(getStorageKey("project-demo", "pinnedSessions")).toBe(
      "relaydesk.workspace.project-demo.commandPalette.pinnedSessions"
    );
    expect(getStorageKey("project-demo", "recentCommands")).toBe(
      "relaydesk.workspace.project-demo.commandPalette.recentCommands"
    );
  });

  it("resolves activity timestamps by last message first", () => {
    const updatedAtOnly = createSession({
      updatedAt: "2026-04-05T10:00:00.000Z",
      createdAt: "2026-04-05T09:00:00.000Z"
    });
    const withLastMessage = createSession({
      lastMessageAt: "2026-04-05T11:00:00.000Z"
    });

    expect(getSessionActivityAt(updatedAtOnly)).toBe(Date.parse("2026-04-05T10:00:00.000Z"));
    expect(getSessionActivityAt(withLastMessage)).toBe(Date.parse("2026-04-05T11:00:00.000Z"));
  });

  it("maps command groups to section labels", () => {
    expect(getGroupLabel("workbench")).toBe("工作台");
    expect(getGroupLabel("session")).toBe("会话");
    expect(getGroupLabel("project")).toBe("项目");
  });
});
