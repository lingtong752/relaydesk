import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAgentRun } from "../features/agent/useAgentRun";
import { WorkspaceAgentPage } from "./WorkspaceAgentPage";

vi.mock("../features/agent/useAgentRun", () => ({
  useAgentRun: vi.fn()
}));

vi.mock("../features/agent/components/RunHistoryPanel", () => ({
  RunHistoryPanel: () => <div>run-history-panel</div>
}));

function createAgentRunState(): ReturnType<typeof useAgentRun> {
  return {
    token: "token-demo",
    selectedSession: {
      id: "session-1",
      projectId: "project-demo",
      title: "会话 1",
      provider: "codex",
      origin: "relaydesk",
      status: "idle",
      createdAt: "2026-03-28T10:00:00.000Z",
      updatedAt: "2026-03-28T10:00:00.000Z"
    },
    activeRun: {
      id: "run-1",
      projectId: "project-demo",
      sessionId: "session-1",
      provider: "codex",
      status: "paused",
      objective: "拆分前端模块",
      constraints: "保守推进",
      startedAt: "2026-03-28T10:02:00.000Z",
      updatedAt: "2026-03-28T10:02:00.000Z"
    },
    pendingApprovals: [
      {
        id: "approval-1",
        projectId: "project-demo",
        sessionId: "session-1",
        runId: "run-1",
        title: "需要人工审批",
        reason: "准备执行风险操作",
        status: "pending",
        createdAt: "2026-03-28T10:03:00.000Z",
        updatedAt: "2026-03-28T10:03:00.000Z"
      }
    ],
    realtimeState: "connected",
    workspaceError: null,
    displayedRun: {
      id: "run-1",
      projectId: "project-demo",
      sessionId: "session-1",
      provider: "codex",
      status: "paused",
      objective: "拆分前端模块",
      constraints: "保守推进",
      startedAt: "2026-03-28T10:02:00.000Z",
      updatedAt: "2026-03-28T10:02:00.000Z"
    },
    hasBlockingRun: true,
    runObjective: "拆分前端模块",
    runConstraints: "保守推进",
    approvalActionId: null,
    runAction: null,
    setRunObjective: vi.fn(),
    setRunConstraints: vi.fn(),
    startAgentRun: vi.fn(),
    stopAgentRun: vi.fn(),
    takeoverAgentRun: vi.fn(),
    resumeAgentRun: vi.fn(),
    approvePendingApproval: vi.fn(),
    rejectPendingApproval: vi.fn(),
    handleRunRestored: vi.fn()
  } as ReturnType<typeof useAgentRun>;
}

describe("WorkspaceAgentPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders run controls, approval queue, and run history", () => {
    vi.mocked(useAgentRun).mockReturnValue(createAgentRunState());

    const markup = renderToStaticMarkup(<WorkspaceAgentPage />);

    expect(markup).toContain("替身已暂停");
    expect(markup).toContain("本轮目标");
    expect(markup).toContain("需要人工审批");
    expect(markup).toContain("准备执行风险操作");
    expect(markup).toContain("恢复替身");
    expect(markup).toContain("run-history-panel");
  });
});
