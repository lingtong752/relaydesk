import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SessionRecord } from "@shared";
import { SessionListPanel } from "./SessionListPanel";

function createSession(session: Partial<SessionRecord> & Pick<SessionRecord, "id" | "title">): SessionRecord {
  return {
    id: session.id,
    projectId: "project-demo",
    provider: session.provider ?? "codex",
    title: session.title,
    origin: session.origin ?? "relaydesk",
    status: session.status ?? "idle",
    createdAt: session.createdAt ?? "2026-04-05T08:00:00.000Z",
    updatedAt: session.updatedAt ?? "2026-04-05T08:00:00.000Z",
    lastMessageAt: session.lastMessageAt
  };
}

describe("SessionListPanel", () => {
  it("prioritizes running sessions and marks unread activity", () => {
    const markup = renderToStaticMarkup(
      <SessionListPanel
        creatingSession={false}
        newSessionProvider="codex"
        onCreateSession={vi.fn()}
        onOpenProjects={vi.fn()}
        onProviderChange={vi.fn()}
        onSelectSession={vi.fn()}
        projectName="RelayDesk Demo"
        projectRootPath="/tmp/relaydesk-demo"
        selectedSessionId="session-selected"
        sessionCountLabel="4 个会话"
        sessions={[
          createSession({
            id: "session-selected",
            title: "当前会话",
            updatedAt: "2026-04-05T08:00:00.000Z",
            lastMessageAt: "2026-04-05T08:00:00.000Z"
          }),
          createSession({
            id: "session-running",
            title: "运行会话",
            status: "running",
            updatedAt: "2026-04-05T07:00:00.000Z",
            lastMessageAt: "2026-04-05T07:00:00.000Z"
          }),
          createSession({
            id: "session-unread",
            title: "新消息会话",
            status: "idle",
            updatedAt: "2026-04-05T09:00:00.000Z",
            lastMessageAt: "2026-04-05T09:00:00.000Z"
          }),
          createSession({
            id: "session-idle",
            title: "普通会话",
            status: "idle",
            updatedAt: "2026-04-05T06:00:00.000Z",
            lastMessageAt: "2026-04-05T06:00:00.000Z"
          })
        ]}
      />
    );

    expect(markup).toContain("运行中");
    expect(markup).toContain("新消息");
    expect(markup.indexOf("运行会话")).toBeLessThan(markup.indexOf("新消息会话"));
    expect(markup.indexOf("新消息会话")).toBeLessThan(markup.indexOf("普通会话"));
  });
});
