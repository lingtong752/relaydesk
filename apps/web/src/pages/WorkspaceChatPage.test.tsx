import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
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
    activeSessionId: "session-1",
    sessionCapabilities: {
      "session-1": {
        canSendMessages: true,
        canResume: false,
        canStartRuns: true,
        canAttachTerminal: true
      }
    },
    recentSessionAuditEvents: [],
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
    handleRunCreated: vi.fn(),
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

    const markup = renderToStaticMarkup(
      <StaticRouter location="/workspace/project-demo/chat">
        <WorkspaceChatPage />
      </StaticRouter>
    );

    expect(markup).toContain("当前项目的协作上下文");
    expect(markup).toContain("Projects");
    expect(markup).toContain("Conversations");
    expect(markup).toContain("RelayDesk Demo");
    expect(markup).toContain("会话 1");
    expect(markup).toContain("Provider: codex");
    expect(markup).toContain("跳到文件");
    expect(markup).toContain("跳到 Git");
    expect(markup).toContain("打开绑定终端");
    expect(markup).toContain("帮我检查一下当前任务");
    expect(markup).toContain("继续拆分前端模块");
  });

  it("renders imported session runtime and recent resume status", () => {
    vi.mocked(useProjectWorkspace).mockReturnValue({
      ...createWorkspaceContext(),
      sessions: [
        {
          id: "session-imported",
          projectId: "project-demo",
          title: "CLI 会话",
          provider: "claude",
          origin: "imported_cli",
          runtimeMode: "cli_session_mode",
          capabilities: {
            canSendMessages: false,
            canResume: false,
            canStartRuns: false,
            canAttachTerminal: true
          },
          lastResumeStatus: "failed",
          lastResumeError: "Claude CLI not available",
          status: "idle",
          createdAt: "2026-03-28T10:00:00.000Z",
          updatedAt: "2026-03-28T10:00:00.000Z"
        }
      ],
      selectedSessionId: "session-imported",
      selectedSession: {
        id: "session-imported",
        projectId: "project-demo",
        title: "CLI 会话",
        provider: "claude",
        origin: "imported_cli",
        runtimeMode: "cli_session_mode",
        capabilities: {
          canSendMessages: false,
          canResume: false,
          canStartRuns: false,
          canAttachTerminal: true
        },
        lastResumeStatus: "failed",
        lastResumeError: "Claude CLI not available",
        status: "idle",
        createdAt: "2026-03-28T10:00:00.000Z",
        updatedAt: "2026-03-28T10:00:00.000Z"
      }
    } as ReturnType<typeof useProjectWorkspace>);
    vi.mocked(useSessionMessages).mockReturnValue({
      ...createSessionMessagesState(),
      messages: []
    } as ReturnType<typeof useSessionMessages>);

    const markup = renderToStaticMarkup(
      <StaticRouter location="/workspace/project-demo/chat">
        <WorkspaceChatPage />
      </StaticRouter>
    );

    expect(markup).toContain("原生 CLI session");
    expect(markup).toContain("只读");
    expect(markup).toContain("最近恢复失败：Claude CLI not available");
    expect(markup).toContain("跳到文件");
    expect(markup).toContain("跳到 Git");
    expect(markup).toContain("打开绑定终端");
  });
});
