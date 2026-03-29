function summarize(value: string, maxLength: number): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "";
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}

export function buildApprovalTitle(objective: string): string {
  const summary = summarize(objective, 28);
  if (!summary) {
    return "是否允许替身 AI Agent 继续执行";
  }

  return `是否批准继续执行：${summary}`;
}

export function buildApprovalReason(objective: string, constraints: string): string {
  const objectiveLine = summarize(objective, 120) || "未填写目标";
  const constraintsLine = summarize(constraints, 120) || "未填写边界，将按保守模式推进。";

  return [
    `目标：${objectiveLine}`,
    `边界：${constraintsLine}`,
    "审批通过后，替身 AI Agent 将继续代表用户推进本轮讨论。"
  ].join(" ");
}

export function buildPendingApprovalMessage(objective: string): string {
  const summary = summarize(objective, 60) || "当前任务";
  return `替身 AI Agent 已准备开始执行“${summary}”，正在等待人工审批。`;
}

export function buildRejectedRunMessage(title: string): string {
  return `审批未通过，已停止本轮替身运行。审批项：${title}`;
}

export function buildTakeoverMessage(): string {
  return "真实用户已人工接管当前运行，替身 AI Agent 已暂停。";
}

export function buildResumePendingMessage(objective: string): string {
  const summary = summarize(objective, 60) || "当前任务";
  return `已请求恢复替身 AI Agent 执行“${summary}”，正在等待新的人工审批。`;
}

export function buildRestorePendingMessage(objective: string, checkpointSummary: string): string {
  const summary = summarize(objective, 60) || "当前任务";
  const checkpointLabel = summarize(checkpointSummary, 48) || "最近检查点";
  return `已从检查点“${checkpointLabel}”恢复替身 AI Agent 执行“${summary}”，正在等待新的人工审批。`;
}
