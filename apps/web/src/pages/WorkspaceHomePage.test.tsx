import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useProjectWorkspace } from "../features/workspace/useProjectWorkspace";
import { WorkspaceHomePage } from "./WorkspaceHomePage";

vi.mock("../features/workspace/useProjectWorkspace", () => ({
  useProjectWorkspace: vi.fn()
}));

function createWorkspaceContext(): ReturnType<typeof useProjectWorkspace> {
  return {
    projectId: "project-demo",
    token: "token-demo",
    projectName: "RelayDesk Demo",
    projectRootPath: "/tmp/relaydesk",
    sessions: [
      {
        id: "session-1",
        projectId: "project-demo",
        title: "设计改版会话",
        provider: "codex",
        origin: "relaydesk",
        status: "idle",
        createdAt: "2026-03-28T10:00:00.000Z",
        updatedAt: "2026-03-28T10:05:00.000Z"
      },
      {
        id: "session-2",
        projectId: "project-demo",
        title: "CLI 导入会话",
        provider: "claude",
        origin: "imported_cli",
        status: "idle",
        createdAt: "2026-03-28T09:00:00.000Z",
        updatedAt: "2026-03-28T09:30:00.000Z"
      }
    ],
    selectedSessionId: "session-1",
    selectedSession: {
      id: "session-1",
      projectId: "project-demo",
      title: "设计改版会话",
      provider: "codex",
      origin: "relaydesk",
      status: "idle",
      createdAt: "2026-03-28T10:00:00.000Z",
      updatedAt: "2026-03-28T10:05:00.000Z"
    },
    newSessionProvider: "codex",
    activeRun: {
      id: "run-1",
      projectId: "project-demo",
      sessionId: "session-1",
      provider: "codex",
      objective: "统一首页与左侧菜单",
      constraints: "保持导航清晰",
      status: "waiting_human",
      startedAt: "2026-03-28T10:10:00.000Z",
      updatedAt: "2026-03-28T10:15:00.000Z"
    },
    latestRun: null,
    pendingApprovals: [
      {
        id: "approval-1",
        projectId: "project-demo",
        sessionId: "session-1",
        runId: "run-1",
        title: "需要审批",
        reason: "准备调整导航层级",
        status: "pending",
        createdAt: "2026-03-28T10:16:00.000Z",
        updatedAt: "2026-03-28T10:16:00.000Z"
      }
    ],
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
    handleRunRestored: vi.fn()
  } as ReturnType<typeof useProjectWorkspace>;
}

describe("WorkspaceHomePage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders workspace overview, quick actions, and recent sessions", () => {
    vi.mocked(useProjectWorkspace).mockReturnValue(createWorkspaceContext());

    const markup = renderToStaticMarkup(
      <StaticRouter location="/workspace/project-demo/home">
        <WorkspaceHomePage />
      </StaticRouter>
    );

    expect(markup).toContain("先看状态，再决定下一步动作");
    expect(markup).toContain("会话总数");
    expect(markup).toContain("待审批项");
    expect(markup).toContain("等待人工");
    expect(markup).toContain("设计改版会话");
    expect(markup).toContain("CLI 导入会话");
    expect(markup).toContain("按模块继续推进");
    expect(markup).toContain("工作区工具");
  });
});
