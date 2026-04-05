import { describe, expect, it, vi } from "vitest";
import type { SessionRecord } from "@shared";
import {
  buildSessionCountLabel,
  buildWorkspaceToolPath,
  createSessionWithLoadingState,
  navigateToWorkspaceTool,
  selectSessionWithCleanup,
  stopSessionOutput,
  submitSessionMessage
} from "./workspaceChatPageActions";

function createSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "session-1",
    projectId: "project-1",
    provider: "mock",
    title: "session",
    origin: "relaydesk",
    runtimeMode: "api_mode",
    status: "idle",
    createdAt: "2026-04-05T08:00:00.000Z",
    updatedAt: "2026-04-05T08:00:00.000Z",
    ...overrides
  };
}

describe("workspaceChatPageActions", () => {
  it("builds session count label and tool route path", () => {
    expect(buildSessionCountLabel(3)).toBe("3 个会话");
    expect(
      buildWorkspaceToolPath({
        projectId: "project-demo",
        tool: "terminal",
        sessionId: "session-123"
      })
    ).toBe("/workspace/project-demo/tools/terminal?sessionId=session-123");
  });

  it("navigates to workspace tool only when session is selected", () => {
    const navigate = vi.fn();

    expect(
      navigateToWorkspaceTool({
        projectId: "project-demo",
        selectedSession: null,
        tool: "files",
        navigate
      })
    ).toBe(false);
    expect(navigate).not.toHaveBeenCalled();

    expect(
      navigateToWorkspaceTool({
        projectId: "project-demo",
        selectedSession: createSession({ id: "session-123" }),
        tool: "git",
        navigate
      })
    ).toBe(true);
    expect(navigate).toHaveBeenCalledWith(
      "/workspace/project-demo/tools/git?sessionId=session-123"
    );
  });

  it("executes create session flow with loading state and cleanup", async () => {
    const clearChatError = vi.fn();
    const setCreatingSession = vi.fn();
    const createSession = vi.fn().mockResolvedValue(undefined);

    await createSessionWithLoadingState({
      clearChatError,
      setCreatingSession,
      createSession
    });

    expect(clearChatError).toHaveBeenCalledTimes(1);
    expect(setCreatingSession).toHaveBeenNthCalledWith(1, true);
    expect(setCreatingSession).toHaveBeenLastCalledWith(false);

    const failingCreateSession = vi.fn().mockRejectedValue(new Error("failed"));
    await expect(
      createSessionWithLoadingState({
        clearChatError,
        setCreatingSession,
        createSession: failingCreateSession
      })
    ).rejects.toThrow("failed");
    expect(setCreatingSession).toHaveBeenLastCalledWith(false);
  });

  it("selects session and delegates submit/stop actions", async () => {
    const clearChatError = vi.fn();
    const selectSession = vi.fn();
    selectSessionWithCleanup({
      sessionId: "session-xyz",
      clearChatError,
      selectSession
    });
    expect(clearChatError).toHaveBeenCalledTimes(1);
    expect(selectSession).toHaveBeenCalledWith("session-xyz");

    const preventDefault = vi.fn();
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    await submitSessionMessage({
      event: { preventDefault } as Pick<React.FormEvent<HTMLFormElement>, "preventDefault">,
      sendMessage
    });
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);

    const stopSession = vi.fn().mockResolvedValue(undefined);
    await stopSessionOutput({ stopSession });
    expect(stopSession).toHaveBeenCalledTimes(1);
  });
});
