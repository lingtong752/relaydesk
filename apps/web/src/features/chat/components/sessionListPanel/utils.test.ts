import { describe, expect, it } from "vitest";
import type { SessionRecord } from "@shared";
import {
  filterSessionsByKeyword,
  getSelectedSessionActivityAt,
  hasUnreadActivity,
  sortSessionsForPanel
} from "./utils";

function createSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "session-default",
    projectId: "project-demo",
    provider: "mock",
    title: "Default Session",
    origin: "relaydesk",
    runtimeMode: "api_mode",
    status: "idle",
    createdAt: "2026-04-05T08:00:00.000Z",
    updatedAt: "2026-04-05T08:00:00.000Z",
    capabilities: {
      canSendMessages: true,
      canResume: false,
      canStartRuns: true,
      canAttachTerminal: true
    },
    ...overrides
  };
}

describe("sessionListPanel utils", () => {
  it("computes selected session activity timestamp", () => {
    const sessions = [
      createSession({
        id: "session-a",
        updatedAt: "2026-04-05T09:00:00.000Z"
      }),
      createSession({
        id: "session-b",
        lastMessageAt: "2026-04-05T11:00:00.000Z"
      })
    ];

    expect(getSelectedSessionActivityAt(sessions, "session-b")).toBe(
      Date.parse("2026-04-05T11:00:00.000Z")
    );
    expect(getSelectedSessionActivityAt(sessions, "session-missing")).toBe(0);
  });

  it("marks unread activity when a different session has newer activity", () => {
    const target = createSession({
      id: "session-a",
      updatedAt: "2026-04-05T12:00:00.000Z"
    });
    const selectedActivityAt = Date.parse("2026-04-05T10:00:00.000Z");

    expect(hasUnreadActivity(target, "session-selected", selectedActivityAt)).toBe(true);
    expect(hasUnreadActivity(target, "session-a", selectedActivityAt)).toBe(false);
  });

  it("sorts sessions by priority and then activity", () => {
    const sessions = [
      createSession({
        id: "session-selected",
        title: "selected",
        status: "idle",
        updatedAt: "2026-04-05T10:00:00.000Z"
      }),
      createSession({
        id: "session-unread",
        title: "unread",
        status: "idle",
        updatedAt: "2026-04-05T11:00:00.000Z"
      }),
      createSession({
        id: "session-reconnecting",
        title: "reconnecting",
        status: "reconnecting",
        updatedAt: "2026-04-05T09:00:00.000Z"
      }),
      createSession({
        id: "session-running",
        title: "running",
        status: "running",
        updatedAt: "2026-04-05T08:00:00.000Z"
      })
    ];

    const sorted = sortSessionsForPanel(
      sessions,
      "session-selected",
      Date.parse("2026-04-05T10:00:00.000Z")
    );

    expect(sorted.map((session) => session.id)).toEqual([
      "session-running",
      "session-reconnecting",
      "session-unread",
      "session-selected"
    ]);
  });

  it("filters sessions by title, provider, and origin keyword", () => {
    const sessions = [
      createSession({ id: "session-a", title: "Fix Auth", provider: "codex", origin: "relaydesk" }),
      createSession({ id: "session-b", title: "CLI Imported", provider: "claude", origin: "imported_cli" })
    ];

    expect(filterSessionsByKeyword(sessions, "auth").map((session) => session.id)).toEqual(["session-a"]);
    expect(filterSessionsByKeyword(sessions, "claude").map((session) => session.id)).toEqual(["session-b"]);
    expect(filterSessionsByKeyword(sessions, "imported").map((session) => session.id)).toEqual(["session-b"]);
    expect(filterSessionsByKeyword(sessions, "   ").map((session) => session.id)).toEqual([
      "session-a",
      "session-b"
    ]);
  });
});
