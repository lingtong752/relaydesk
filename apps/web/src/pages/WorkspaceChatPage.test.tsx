import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSessionMessages } from "../features/chat/useSessionMessages";
import { useProjectWorkspace } from "../features/workspace/useProjectWorkspace";
import { WorkspaceChatPage } from "./WorkspaceChatPage";

vi.mock("../features/workspace/useProjectWorkspace", () => ({
  useProjectWorkspace: vi.fn()
}));

vi.mock("../features/chat/useSessionMessages", () => ({
  useSessionMessages: vi.fn()
}));

function createWorkspaceContext(): ReturnType<typeof useProjectWorkspace> {
  return {
    projectId: "project-demo",
    token: "token-demo",
    projectName: "RelayDesk Demo",
    projectRootPath: "/tmp/demo",
    sessions: [
      {
        id: "session-1",
        projectId: "project-demo",
        title: "会话 1",
        provider: "codex",
        origin: "relaydesk",
        status: "idle",
        createdAt: "2026-03-28T10:00:00.000Z",
        updatedAt: "2026-03-28T10:00:00.000Z"
      }
    ],
    selectedSessionId: "session-1",
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
    handleRunRestored: vi.fn()
  } as ReturnType<typeof useProjectWorkspace>;
}

function createSessionMessagesState(): ReturnType<typeof useSessionMessages> {
  return {
    messages: [
      {
        id: "message-1",
        sessionId: "session-1",
        projectId: "project-demo",
        role: "human",
        senderType: "user",
        content: "帮我检查一下当前任务",
        status: "completed",
        createdAt: "2026-03-28T10:01:00.000Z",
        updatedAt: "2026-03-28T10:01:00.000Z"
      }
    ],
    messageDraft: "继续拆分前端模块",
    pageError: null,
    stoppingSession: false,
    clearChatError: vi.fn(),
    setMessageDraft: vi.fn(),
    sendMessage: vi.fn(),
    stopSession: vi.fn()
  } as ReturnType<typeof useSessionMessages>;
}

describe("WorkspaceChatPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders session list and current session content", () => {
    vi.mocked(useProjectWorkspace).mockReturnValue(createWorkspaceContext());
    vi.mocked(useSessionMessages).mockReturnValue(createSessionMessagesState());

    const markup = renderToStaticMarkup(<WorkspaceChatPage />);

    expect(markup).toContain("当前项目的协作上下文");
    expect(markup).toContain("会话 1");
    expect(markup).toContain("Provider: codex");
    expect(markup).toContain("帮我检查一下当前任务");
    expect(markup).toContain("继续拆分前端模块");
  });
});
