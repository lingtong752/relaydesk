import { useState } from "react";
import type { ApprovalRecord, RunRecord } from "@shared";
import { useProjectWorkspace } from "../workspace/useProjectWorkspace";

interface AgentRunState {
  token: string | null;
  selectedSession: ReturnType<typeof useProjectWorkspace>["selectedSession"];
  activeRun: RunRecord | null;
  pendingApprovals: ApprovalRecord[];
  realtimeState: ReturnType<typeof useProjectWorkspace>["realtimeState"];
  workspaceError: string | null;
  displayedRun: RunRecord | null;
  hasBlockingRun: boolean;
  runObjective: string;
  runConstraints: string;
  approvalActionId: string | null;
  runAction: "stop" | "takeover" | "resume" | null;
  setRunObjective(value: string): void;
  setRunConstraints(value: string): void;
  startAgentRun(): Promise<void>;
  stopAgentRun(): Promise<void>;
  takeoverAgentRun(): Promise<void>;
  resumeAgentRun(): Promise<void>;
  approvePendingApproval(approvalId: string): Promise<void>;
  rejectPendingApproval(approvalId: string): Promise<void>;
  handleRunRestored(run: RunRecord | null, approval: ApprovalRecord | null): void;
}

export function useAgentRun(): AgentRunState {
  const {
    token,
    selectedSession,
    activeRun,
    latestRun,
    pendingApprovals,
    realtimeState,
    workspaceError,
    clearWorkspaceError,
    startRun,
    stopRun,
    takeoverRun,
    resumeRun,
    approveApproval,
    rejectApproval,
    handleRunRestored
  } = useProjectWorkspace();
  const [runObjective, setRunObjective] = useState("帮我拆解当前项目的下一步开发任务");
  const [runConstraints, setRunConstraints] = useState("保守推进，遇到风险操作时停下来等待人工介入。");
  const [approvalActionId, setApprovalActionId] = useState<string | null>(null);
  const [runAction, setRunAction] = useState<"stop" | "takeover" | "resume" | null>(null);

  const displayedRun = activeRun ?? latestRun;
  const hasBlockingRun = activeRun !== null;

  async function startAgentRun(): Promise<void> {
    clearWorkspaceError();
    await startRun({
      objective: runObjective,
      constraints: runConstraints
    });
  }

  async function stopAgentRun(): Promise<void> {
    setRunAction("stop");
    clearWorkspaceError();
    try {
      await stopRun();
    } finally {
      setRunAction(null);
    }
  }

  async function takeoverAgentRun(): Promise<void> {
    setRunAction("takeover");
    clearWorkspaceError();
    try {
      await takeoverRun();
    } finally {
      setRunAction(null);
    }
  }

  async function resumeAgentRun(): Promise<void> {
    setRunAction("resume");
    clearWorkspaceError();
    try {
      await resumeRun();
    } finally {
      setRunAction(null);
    }
  }

  async function approvePendingApproval(approvalId: string): Promise<void> {
    setApprovalActionId(approvalId);
    clearWorkspaceError();
    try {
      await approveApproval(approvalId);
    } finally {
      setApprovalActionId(null);
    }
  }

  async function rejectPendingApproval(approvalId: string): Promise<void> {
    setApprovalActionId(approvalId);
    clearWorkspaceError();
    try {
      await rejectApproval(approvalId);
    } finally {
      setApprovalActionId(null);
    }
  }

  return {
    token,
    selectedSession,
    activeRun,
    pendingApprovals,
    realtimeState,
    workspaceError,
    displayedRun,
    hasBlockingRun,
    runObjective,
    runConstraints,
    approvalActionId,
    runAction,
    setRunObjective,
    setRunConstraints,
    startAgentRun,
    stopAgentRun,
    takeoverAgentRun,
    resumeAgentRun,
    approvePendingApproval,
    rejectPendingApproval,
    handleRunRestored
  };
}
