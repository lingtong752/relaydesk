import { describe, expect, it } from "vitest";
import type { SessionRecord } from "@shared";
import { buildCurrentSessionPanelViewModel } from "./viewModel";

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

describe("currentSessionPanel viewModel", () => {
  it("returns disabled defaults when no session is selected", () => {
    const model = buildCurrentSessionPanelViewModel({
      selectedSession: null,
      stoppingSession: false
    });

    expect(model.sessionDescription).toBeUndefined();
    expect(model.workspaceInfoMessage).toBeNull();
    expect(model.importedInfoMessage).toBeNull();
    expect(model.resumeInfoMessage).toBeNull();
    expect(model.composerDisabled).toBe(true);
    expect(model.openActionsDisabled).toBe(true);
    expect(model.openTerminalDisabled).toBe(true);
    expect(model.stopButtonDisabled).toBe(true);
  });

  it("builds imported read-only state and keeps stop disabled", () => {
    const model = buildCurrentSessionPanelViewModel({
      selectedSession: createSession({
        origin: "imported_cli",
        provider: "cursor",
        lastResumeStatus: "failed",
        lastResumeError: "CLI not available"
      }),
      stoppingSession: false
    });

    expect(model.sessionDescription).toContain("Provider: cursor");
    expect(model.importedInfoMessage).toContain("只读观察模式");
    expect(model.importedInfoMessage).toContain("最近恢复失败：CLI not available");
    expect(model.resumeInfoMessage).toBeNull();
    expect(model.composerDisabled).toBe(true);
    expect(model.stopButtonDisabled).toBe(true);
    expect(model.composerPlaceholder).toContain("只读");
  });

  it("builds relaydesk managed state and keeps stop enabled while running", () => {
    const model = buildCurrentSessionPanelViewModel({
      selectedSession: createSession({
        provider: "codex",
        sourcePath: "/tmp/demo",
        lastResumeStatus: "succeeded"
      }),
      stoppingSession: false
    });

    expect(model.sessionDescription).toContain("RelayDesk 托管会话");
    expect(model.workspaceInfoMessage).toContain("/tmp/demo");
    expect(model.importedInfoMessage).toBeNull();
    expect(model.resumeInfoMessage).toContain("最近恢复成功");
    expect(model.composerDisabled).toBe(false);
    expect(model.stopButtonDisabled).toBe(false);
    expect(model.composerPlaceholder).toBe("输入你要交给 Agent 的任务");
  });
});
