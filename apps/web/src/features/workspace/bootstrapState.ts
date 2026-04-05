import type { ApprovalRecord, RunRecord, SessionRecord } from "@shared";

export function mergePendingApprovals(
  current: ApprovalRecord[],
  incoming: ApprovalRecord
): ApprovalRecord[] {
  const withoutIncoming = current.filter((item) => item.id !== incoming.id);
  if (incoming.status !== "pending") {
    return withoutIncoming;
  }

  return [incoming, ...withoutIncoming].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt)
  );
}

export function getActiveRunForStatus(run: RunRecord | null): RunRecord | null {
  if (!run) {
    return null;
  }

  return ["running", "waiting_human", "paused"].includes(run.status) ? run : null;
}

export function resolveSelectedSessionId(input: {
  currentSelectedSessionId: string;
  activeSessionId: string | null;
  sessions: SessionRecord[];
}): string {
  if (
    input.activeSessionId &&
    input.sessions.some((session) => session.id === input.activeSessionId)
  ) {
    return input.activeSessionId;
  }

  if (
    input.currentSelectedSessionId &&
    input.sessions.some((session) => session.id === input.currentSelectedSessionId)
  ) {
    return input.currentSelectedSessionId;
  }

  return input.sessions[0]?.id ?? "";
}
