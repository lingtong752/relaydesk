import { renderToStaticMarkup } from "react-dom/server";
import { Route, Routes } from "react-router-dom";
import { StaticRouter } from "react-router-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useProjectWorkspace } from "../features/workspace/useProjectWorkspace";
import { WorkspaceFilesToolPage } from "./WorkspaceFilesToolPage";
import { WorkspaceGitToolPage } from "./WorkspaceGitToolPage";
import { WorkspaceTerminalToolPage } from "./WorkspaceTerminalToolPage";
import { WorkspaceToolsPage } from "./WorkspaceToolsPage";

vi.mock("../features/workspace/useProjectWorkspace", () => ({
  useProjectWorkspace: vi.fn()
}));

vi.mock("../features/tools/files/components/FileWorkspace", () => ({
  FileWorkspace: (props: { boundSession?: { id: string } | null }) => (
    <div>files-workspace-panel:{props.boundSession?.id ?? "none"}</div>
  )
}));

vi.mock("../features/tools/terminal/components/TerminalWorkspace", () => ({
  TerminalWorkspace: (props: {
    focusSourceSessionId?: string;
    workspaceSessions?: Array<{ id: string }>;
  }) => (
    <div>
      terminal-workspace-panel
      {props.focusSourceSessionId ? `:${props.focusSourceSessionId}` : ""}
      :{props.workspaceSessions?.length ?? 0}
    </div>
  )
}));

vi.mock("../features/tools/git/components/GitWorkspace", () => ({
  GitWorkspace: (props: { boundSession?: { id: string } | null }) => (
    <div>git-workspace-panel:{props.boundSession?.id ?? "none"}</div>
  )
}));

function createWorkspaceContext(
  overrides: Partial<ReturnType<typeof useProjectWorkspace>> = {}
): ReturnType<typeof useProjectWorkspace> {
  return {
    projectId: "project-demo",
    token: "token-demo",
    projectName: "RelayDesk Demo",
    projectRootPath: "/tmp/demo",
    sessions: [],
    selectedSessionId: "",
    selectedSession: null,
    newSessionProvider: "mock",
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
    handleRunRestored: vi.fn(),
    ...overrides
  } as ReturnType<typeof useProjectWorkspace>;
}

function renderToolsRoute(initialEntry: string): string {
  return renderToStaticMarkup(
    <StaticRouter location={initialEntry}>
      <Routes>
        <Route path="/workspace/:projectId/tools" element={<WorkspaceToolsPage />}>
          <Route path="files" element={<WorkspaceFilesToolPage />} />
          <Route path="terminal" element={<WorkspaceTerminalToolPage />} />
          <Route path="git" element={<WorkspaceGitToolPage />} />
        </Route>
      </Routes>
    </StaticRouter>
  );
}

describe("WorkspaceTools routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the files tool route", () => {
    vi.mocked(useProjectWorkspace).mockReturnValue(createWorkspaceContext());

    const markup = renderToolsRoute("/workspace/project-demo/tools/files");

    expect(markup).toContain("文件、终端与 Git");
    expect(markup).toContain("files-workspace-panel:none");
  });

  it("renders the terminal tool route", () => {
    vi.mocked(useProjectWorkspace).mockReturnValue(createWorkspaceContext());

    const markup = renderToolsRoute("/workspace/project-demo/tools/terminal");

    expect(markup).toContain("terminal-workspace-panel:0");
  });

  it("passes the current session query into the terminal workspace", () => {
    vi.mocked(useProjectWorkspace).mockReturnValue(
      createWorkspaceContext({
        sessions: [
          {
            id: "session-123",
            projectId: "project-demo",
            title: "会话 123",
            provider: "codex",
            origin: "relaydesk",
            status: "idle",
            createdAt: "2026-03-29T08:00:00.000Z",
            updatedAt: "2026-03-29T08:00:00.000Z"
          }
        ]
      })
    );

    const markup = renderToolsRoute("/workspace/project-demo/tools/terminal?sessionId=session-123");

    expect(markup).toContain("terminal-workspace-panel:session-123:1");
  });

  it("passes the current session query into the file workspace", () => {
    vi.mocked(useProjectWorkspace).mockReturnValue(
      createWorkspaceContext({
        sessions: [
          {
            id: "session-123",
            projectId: "project-demo",
            title: "会话 123",
            provider: "codex",
            origin: "relaydesk",
            status: "idle",
            createdAt: "2026-03-29T08:00:00.000Z",
            updatedAt: "2026-03-29T08:00:00.000Z"
          }
        ]
      })
    );

    const markup = renderToolsRoute("/workspace/project-demo/tools/files?sessionId=session-123");

    expect(markup).toContain("files-workspace-panel:session-123");
  });

  it("passes the current session query into the git workspace", () => {
    vi.mocked(useProjectWorkspace).mockReturnValue(
      createWorkspaceContext({
        sessions: [
          {
            id: "session-123",
            projectId: "project-demo",
            title: "会话 123",
            provider: "codex",
            origin: "relaydesk",
            status: "idle",
            createdAt: "2026-03-29T08:00:00.000Z",
            updatedAt: "2026-03-29T08:00:00.000Z"
          }
        ]
      })
    );

    const markup = renderToolsRoute("/workspace/project-demo/tools/git?sessionId=session-123");

    expect(markup).toContain("git-workspace-panel:session-123");
  });

  it("renders the git tool route", () => {
    vi.mocked(useProjectWorkspace).mockReturnValue(createWorkspaceContext());

    const markup = renderToolsRoute("/workspace/project-demo/tools/git");

    expect(markup).toContain("git-workspace-panel:none");
  });

  it("falls back to selected session when tools route has no session query", () => {
    vi.mocked(useProjectWorkspace).mockReturnValue(
      createWorkspaceContext({
        selectedSessionId: "session-123",
        sessions: [
          {
            id: "session-123",
            projectId: "project-demo",
            title: "会话 123",
            provider: "codex",
            origin: "relaydesk",
            status: "idle",
            createdAt: "2026-03-29T08:00:00.000Z",
            updatedAt: "2026-03-29T08:00:00.000Z"
          }
        ]
      })
    );

    const filesMarkup = renderToolsRoute("/workspace/project-demo/tools/files");
    const terminalMarkup = renderToolsRoute("/workspace/project-demo/tools/terminal");
    const gitMarkup = renderToolsRoute("/workspace/project-demo/tools/git");

    expect(filesMarkup).toContain("files-workspace-panel:session-123");
    expect(terminalMarkup).toContain("terminal-workspace-panel:session-123:1");
    expect(gitMarkup).toContain("git-workspace-panel:session-123");
  });
});
