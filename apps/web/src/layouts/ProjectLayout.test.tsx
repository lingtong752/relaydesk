import { renderToStaticMarkup } from "react-dom/server";
import { Route, Routes } from "react-router-dom";
import { StaticRouter } from "react-router-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useProjectWorkspace } from "../features/workspace/useProjectWorkspace";
import { ProjectLayout } from "./ProjectLayout";

vi.mock("../features/workspace/useProjectWorkspace", () => ({
  useProjectWorkspace: vi.fn()
}));

function createWorkspaceContext(): ReturnType<typeof useProjectWorkspace> {
  return {
    projectId: "project-demo",
    token: "token-demo",
    projectName: "RelayDesk Demo",
    projectRootPath: "/tmp/relaydesk-demo",
    sessions: [
      {
        id: "session-new",
        projectId: "project-demo",
        title: "最新会话",
        provider: "codex",
        origin: "relaydesk",
        status: "idle",
        createdAt: "2026-04-03T10:00:00.000Z",
        updatedAt: "2026-04-03T12:00:00.000Z"
      },
      {
        id: "session-old",
        projectId: "project-demo",
        title: "较早会话",
        provider: "claude",
        origin: "imported_cli",
        status: "idle",
        createdAt: "2026-04-03T08:00:00.000Z",
        updatedAt: "2026-04-03T09:00:00.000Z"
      }
    ],
    activeSessionId: "session-new",
    sessionCapabilities: {
      "session-new": {
        canSendMessages: true,
        canResume: false,
        canStartRuns: true,
        canAttachTerminal: true
      },
      "session-old": {
        canSendMessages: false,
        canResume: false,
        canStartRuns: false,
        canAttachTerminal: true
      }
    },
    recentSessionAuditEvents: [],
    selectedSessionId: "session-new",
    selectedSession: {
      id: "session-new",
      projectId: "project-demo",
      title: "最新会话",
      provider: "codex",
      origin: "relaydesk",
      status: "idle",
      createdAt: "2026-04-03T10:00:00.000Z",
      updatedAt: "2026-04-03T12:00:00.000Z"
    },
    newSessionProvider: "codex",
    activeRun: null,
    latestRun: null,
    pendingApprovals: [],
    realtimeState: "connected",
    reconnectVersion: 0,
    wsClient: null,
    lastRealtimeEvent: null,
    loadingProject: false,
    workspaceError: null,
    setNewSessionProvider: vi.fn(),
    selectSession: vi.fn(),
    clearWorkspaceError: vi.fn(),
    createSession: vi.fn(),
    startRun: vi.fn(),
    stopRun: vi.fn(),
    takeoverRun: vi.fn(),
    resumeRun: vi.fn(),
    approveApproval: vi.fn(),
    rejectApproval: vi.fn(),
    handleRunCreated: vi.fn(),
    handleRunRestored: vi.fn()
  } as ReturnType<typeof useProjectWorkspace>;
}

describe("ProjectLayout", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders top workbench navigation and recent sessions in activity order", () => {
    vi.mocked(useProjectWorkspace).mockReturnValue(createWorkspaceContext());

    const markup = renderToStaticMarkup(
      <StaticRouter location="/workspace/project-demo/chat">
        <Routes>
          <Route
            element={
              <ProjectLayout
                user={{
                  id: "user-demo",
                  email: "demo@relaydesk.dev",
                  createdAt: "2026-04-03T07:00:00.000Z"
                }}
              />
            }
            path="/workspace/:projectId"
          >
            <Route element={<div>chat-route</div>} path="chat" />
          </Route>
        </Routes>
      </StaticRouter>
    );

    expect(markup).toContain("Chat");
    expect(markup).toContain("Shell");
    expect(markup).toContain("Files");
    expect(markup).toContain("Source Control");
    expect(markup).toContain("命令面板");
    expect(markup).toContain("最近会话");
    expect(markup).toContain("固定");
    expect(markup).toContain("最新会话");
    expect(markup).toContain("较早会话");
    expect(markup.indexOf("最新会话")).toBeLessThan(markup.indexOf("较早会话"));
  });

  it("preserves selected session id in workbench navigation links", () => {
    vi.mocked(useProjectWorkspace).mockReturnValue(createWorkspaceContext());

    const markup = renderToStaticMarkup(
      <StaticRouter location="/workspace/project-demo/chat?sessionId=session-new">
        <Routes>
          <Route
            element={
              <ProjectLayout
                user={{
                  id: "user-demo",
                  email: "demo@relaydesk.dev",
                  createdAt: "2026-04-03T07:00:00.000Z"
                }}
              />
            }
            path="/workspace/:projectId"
          >
            <Route element={<div>chat-route</div>} path="chat" />
          </Route>
        </Routes>
      </StaticRouter>
    );

    expect(markup).toContain('href="/workspace/project-demo/chat?sessionId=session-new"');
    expect(markup).toContain('href="/workspace/project-demo/tools/terminal?sessionId=session-new"');
    expect(markup).toContain('href="/workspace/project-demo/tools/files?sessionId=session-new"');
    expect(markup).toContain('href="/workspace/project-demo/tools/git?sessionId=session-new"');
  });
});
