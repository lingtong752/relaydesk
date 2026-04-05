import { describe, expect, it } from "vitest";
import type { SessionRecord } from "@shared";
import {
  getSessionCapabilities,
  getSessionOriginCreationLabel,
  getSessionOriginHistoryLabel,
  getSessionOriginRuntimeLabel,
  getSessionOriginRuntimeLabelByOrigin,
  getSessionResumeStatusLabel,
  getSessionRuntimeMode,
  getSessionStatusLabel
} from "./sessionRuntime";

function createSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "session-1",
    projectId: "project-1",
    provider: "mock",
    title: "session",
    origin: "relaydesk",
    status: "idle",
    runtimeMode: "api_mode",
    createdAt: "2026-04-05T08:00:00.000Z",
    updatedAt: "2026-04-05T08:00:00.000Z",
    ...overrides
  };
}

describe("sessionRuntime", () => {
  it("resolves session capabilities with fallback behavior", () => {
    expect(getSessionCapabilities(null)).toEqual({
      canSendMessages: false,
      canResume: false,
      canStartRuns: false,
      canAttachTerminal: false
    });

    expect(
      getSessionCapabilities(
        createSession({
          capabilities: {
            canSendMessages: true,
            canResume: false,
            canStartRuns: true,
            canAttachTerminal: true
          }
        })
      )
    ).toEqual({
      canSendMessages: true,
      canResume: false,
      canStartRuns: true,
      canAttachTerminal: true
    });

    expect(
      getSessionCapabilities(
        createSession({
          origin: "imported_cli",
          provider: "codex",
          capabilities: undefined
        })
      )
    ).toEqual({
      canSendMessages: true,
      canResume: true,
      canStartRuns: true,
      canAttachTerminal: true
    });

    expect(
      getSessionCapabilities(
        createSession({
          origin: "imported_cli",
          provider: "cursor",
          capabilities: undefined
        })
      )
    ).toEqual({
      canSendMessages: false,
      canResume: false,
      canStartRuns: false,
      canAttachTerminal: true
    });
  });

  it("resolves runtime and origin labels", () => {
    expect(getSessionRuntimeMode(null)).toBe("api_mode");
    expect(
      getSessionRuntimeMode(
        createSession({
          runtimeMode: undefined,
          origin: "imported_cli"
        })
      )
    ).toBe("cli_session_mode");
    expect(getSessionOriginRuntimeLabel(createSession({ runtimeMode: "api_mode" }))).toBe(
      "RelayDesk 托管会话"
    );
    expect(
      getSessionOriginRuntimeLabel(
        createSession({
          runtimeMode: "cli_session_mode",
          origin: "imported_cli"
        })
      )
    ).toBe("原生 CLI session");
    expect(getSessionOriginHistoryLabel(createSession({ origin: "imported_cli" }))).toBe(
      "CLI 历史会话"
    );
    expect(getSessionOriginHistoryLabel(createSession({ origin: "relaydesk" }))).toBe(
      "RelayDesk 会话"
    );
    expect(getSessionOriginCreationLabel(createSession({ origin: "imported_cli" }))).toBe(
      "CLI 导入"
    );
    expect(getSessionOriginCreationLabel(createSession({ origin: "relaydesk" }))).toBe(
      "RelayDesk 创建"
    );
    expect(getSessionOriginRuntimeLabelByOrigin("imported_cli")).toBe("原生 CLI session");
    expect(getSessionOriginRuntimeLabelByOrigin("relaydesk")).toBe("RelayDesk 托管会话");
  });

  it("returns resume and status labels", () => {
    expect(
      getSessionResumeStatusLabel(
        createSession({
          lastResumeStatus: "failed",
          lastResumeError: "CLI not available"
        })
      )
    ).toBe("最近恢复失败：CLI not available");
    expect(
      getSessionResumeStatusLabel(
        createSession({
          lastResumeStatus: "succeeded",
          lastResumedAt: undefined
        })
      )
    ).toBe("最近恢复成功");
    expect(
      getSessionResumeStatusLabel(
        createSession({
          lastResumeStatus: "aborted",
          lastResumeAttemptAt: undefined
        })
      )
    ).toBe("最近恢复已中止");

    expect(getSessionStatusLabel(createSession({ status: "running" }))).toBe("运行中");
    expect(getSessionStatusLabel(createSession({ status: "reconnecting" }))).toBe("恢复中");
    expect(getSessionStatusLabel(createSession({ status: "failed" }))).toBe("失败");
    expect(getSessionStatusLabel(createSession({ status: "stopped" }))).toBe("已停止");
    expect(getSessionStatusLabel(createSession({ status: "idle" }))).toBe("空闲");
  });
});
