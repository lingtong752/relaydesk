import { describe, expect, it } from "vitest";
import type { ApprovalRecord, RunRecord, SessionRecord } from "@shared";
import {
  getActiveRunForStatus,
  mergePendingApprovals,
  resolveSelectedSessionId
} from "./bootstrapState";

function createApproval(overrides: Partial<ApprovalRecord> = {}): ApprovalRecord {
  return {
    id: "approval-default",
    projectId: "project-demo",
    sessionId: "session-demo",
    runId: "run-demo",
    title: "approval",
    reason: "reason",
    status: "pending",
    createdAt: "2026-04-05T08:00:00.000Z",
    updatedAt: "2026-04-05T08:00:00.000Z",
    ...overrides
  };
}

function createRun(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: "run-default",
    projectId: "project-demo",
    sessionId: "session-demo",
    provider: "mock",
    objective: "objective",
    constraints: "",
    status: "running",
    startedAt: "2026-04-05T08:00:00.000Z",
    updatedAt: "2026-04-05T08:00:00.000Z",
    ...overrides
  };
}

function createSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "session-default",
    projectId: "project-demo",
    provider: "mock",
    title: "session",
    origin: "relaydesk",
    runtimeMode: "api_mode",
    status: "idle",
    createdAt: "2026-04-05T08:00:00.000Z",
    updatedAt: "2026-04-05T08:00:00.000Z",
    capabilities: {
      canSendMessages: true,
      canResume: false,
      canStartRuns: true,
      canAttachTerminal: true
    },
    ...overrides
  };
}

describe("bootstrapState helpers", () => {
  it("keeps pending approvals sorted and removes resolved approvals", () => {
    const current = [
      createApproval({ id: "approval-a", createdAt: "2026-04-05T10:00:00.000Z" }),
      createApproval({ id: "approval-b", createdAt: "2026-04-05T11:00:00.000Z" })
    ];

    const merged = mergePendingApprovals(
      current,
      createApproval({ id: "approval-c", createdAt: "2026-04-05T12:00:00.000Z" })
    );
    expect(merged.map((approval) => approval.id)).toEqual([
      "approval-c",
      "approval-b",
      "approval-a"
    ]);

    const withoutResolved = mergePendingApprovals(
      merged,
      createApproval({ id: "approval-b", status: "approved" })
    );
    expect(withoutResolved.map((approval) => approval.id)).toEqual([
      "approval-c",
      "approval-a"
    ]);
  });

  it("returns active run only for running lifecycle states", () => {
    expect(getActiveRunForStatus(createRun({ status: "running" }))?.id).toBe("run-default");
    expect(getActiveRunForStatus(createRun({ status: "waiting_human" }))?.id).toBe("run-default");
    expect(getActiveRunForStatus(createRun({ status: "paused" }))?.id).toBe("run-default");
    expect(getActiveRunForStatus(createRun({ status: "completed" }))).toBeNull();
    expect(getActiveRunForStatus(null)).toBeNull();
  });

  it("selects active session first, then preserves current, then falls back to first", () => {
    const sessions = [
      createSession({ id: "session-1" }),
      createSession({ id: "session-2" })
    ];

    expect(
      resolveSelectedSessionId({
        currentSelectedSessionId: "session-1",
        activeSessionId: "session-2",
        sessions
      })
    ).toBe("session-2");

    expect(
      resolveSelectedSessionId({
        currentSelectedSessionId: "session-1",
        activeSessionId: "missing",
        sessions
      })
    ).toBe("session-1");

    expect(
      resolveSelectedSessionId({
        currentSelectedSessionId: "missing",
        activeSessionId: null,
        sessions
      })
    ).toBe("session-1");

    expect(
      resolveSelectedSessionId({
        currentSelectedSessionId: "missing",
        activeSessionId: null,
        sessions: []
      })
    ).toBe("");
  });
});
