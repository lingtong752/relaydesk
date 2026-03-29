import { ApprovalQueue } from "../features/agent/components/ApprovalQueue";
import { RunHistoryPanel } from "../features/agent/components/RunHistoryPanel";
import { RunControlPanel } from "../features/agent/components/RunControlPanel";
import { useAgentRun } from "../features/agent/useAgentRun";

function getConnectionStatusLabel(state: ReturnType<typeof useAgentRun>["realtimeState"]): string {
  if (state === "connected") {
    return "实时连接正常";
  }

  if (state === "reconnecting") {
    return "正在恢复实时连接";
  }

  if (state === "connecting") {
    return "正在建立实时连接";
  }

  return "实时连接已断开";
}

export function WorkspaceAgentPage(): JSX.Element {
  const {
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
  } = useAgentRun();

  async function handleStartRun(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await startAgentRun();
  }

  async function handleStopRun(): Promise<void> {
    await stopAgentRun();
  }

  async function handleTakeoverRun(): Promise<void> {
    await takeoverAgentRun();
  }

  async function handleResumeRun(): Promise<void> {
    await resumeAgentRun();
  }

  async function handleApprove(approvalId: string): Promise<void> {
    await approvePendingApproval(approvalId);
  }

  async function handleReject(approvalId: string): Promise<void> {
    await rejectPendingApproval(approvalId);
  }

  return (
    <div className="workspace-route-stack workspace-agent-stack">
      {workspaceError ? <div className="error-box">{workspaceError}</div> : null}

      <ApprovalQueue
        approvalActionId={approvalActionId}
        approvals={pendingApprovals}
        onApprove={(approvalId) => void handleApprove(approvalId)}
        onReject={(approvalId) => void handleReject(approvalId)}
      />

      <RunControlPanel
        activeRunStatus={activeRun?.status ?? null}
        displayedRunStatus={displayedRun?.status ?? null}
        hasBlockingRun={hasBlockingRun}
        onResumeRun={() => void handleResumeRun()}
        onRunConstraintsChange={setRunConstraints}
        onRunObjectiveChange={setRunObjective}
        onStartRun={handleStartRun}
        onStopRun={() => void handleStopRun()}
        onTakeoverRun={() => void handleTakeoverRun()}
        realtimeLabel={getConnectionStatusLabel(realtimeState)}
        realtimeStateClassName={`connection-pill state-${realtimeState}`}
        runAction={runAction}
        runConstraints={runConstraints}
        runObjective={runObjective}
        selectedSession={selectedSession}
      />

      {token ? <RunHistoryPanel token={token} run={displayedRun} onRunRestored={handleRunRestored} /> : null}
    </div>
  );
}
