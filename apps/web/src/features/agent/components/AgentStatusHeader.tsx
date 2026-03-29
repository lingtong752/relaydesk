import type { SessionRecord } from "@shared";
import { SectionHeader } from "../../../shared/ui/SectionHeader";
import { StatusPill } from "../../../shared/ui/StatusPill";

interface AgentStatusHeaderProps {
  activeRunStatus: string | null;
  displayedRunStatus: string | null;
  realtimeLabel: string;
  realtimeStateClassName: string;
  selectedSession: SessionRecord | null;
}

function formatActiveRunHeading(status: string): string {
  const headingMap: Record<string, string> = {
    running: "替身正在运行",
    waiting_human: "替身等待人工决策",
    paused: "替身已暂停",
    stopped: "替身已停止",
    completed: "替身已完成",
    failed: "替身执行失败",
    draft: "替身草稿待启动"
  };

  return headingMap[status] ?? `替身状态：${status}`;
}

function formatDisplayedRunHeading(status: string): string {
  const headingMap: Record<string, string> = {
    running: "最近一次运行仍在进行",
    waiting_human: "最近一次运行等待人工",
    paused: "最近一次运行已暂停",
    stopped: "最近一次运行已停止",
    completed: "最近一次运行已完成",
    failed: "最近一次运行失败",
    draft: "最近一次运行仍是草稿"
  };

  return headingMap[status] ?? `最近一次运行：${status}`;
}

export function AgentStatusHeader({
  activeRunStatus,
  displayedRunStatus,
  realtimeLabel,
  realtimeStateClassName,
  selectedSession
}: AgentStatusHeaderProps): JSX.Element {
  const canRunImportedCliSession =
    selectedSession?.origin === "imported_cli" &&
    ["claude", "codex", "gemini"].includes(selectedSession.provider);
  const title = activeRunStatus
    ? formatActiveRunHeading(activeRunStatus)
    : displayedRunStatus
      ? formatDisplayedRunHeading(displayedRunStatus)
      : "准备启动新的替身运行";

  const description = selectedSession
    ? selectedSession.origin === "imported_cli"
      ? canRunImportedCliSession
        ? `${selectedSession.title} · ${selectedSession.provider} · CLI 历史会话，可叠加替身`
        : `${selectedSession.title} · ${selectedSession.provider} · CLI 历史会话，只读查看`
      : `${selectedSession.title} · ${selectedSession.provider} · RelayDesk 会话`
    : "先在协作模块中选择一条会话，再启动替身。";

  return (
    <SectionHeader
      actions={<StatusPill className={realtimeStateClassName.replace(/^connection-pill\s*/, "")} label={realtimeLabel} />}
      description={description}
      eyebrow="替身 AI Agent"
      title={title}
    />
  );
}
