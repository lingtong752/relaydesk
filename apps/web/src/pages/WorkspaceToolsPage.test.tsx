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
  FileWorkspace: () => <div>files-workspace-panel</div>
}));

vi.mock("../features/tools/terminal/components/TerminalWorkspace", () => ({
  TerminalWorkspace: () => <div>terminal-workspace-panel</div>
}));

vi.mock("../features/tools/git/components/GitWorkspace", () => ({
  GitWorkspace: () => <div>git-workspace-panel</div>
}));

function createWorkspaceContext(): ReturnType<typeof useProjectWorkspace> {
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
    handleRunRestored: vi.fn()
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
    expect(markup).toContain("files-workspace-panel");
  });

  it("renders the terminal tool route", () => {
    vi.mocked(useProjectWorkspace).mockReturnValue(createWorkspaceContext());

    const markup = renderToolsRoute("/workspace/project-demo/tools/terminal");

    expect(markup).toContain("terminal-workspace-panel");
  });

  it("renders the git tool route", () => {
    vi.mocked(useProjectWorkspace).mockReturnValue(createWorkspaceContext());

    const markup = renderToolsRoute("/workspace/project-demo/tools/git");

    expect(markup).toContain("git-workspace-panel");
  });
});
