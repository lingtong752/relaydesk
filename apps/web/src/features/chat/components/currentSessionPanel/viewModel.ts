import type { SessionRecord } from "@shared";
import {
  getSessionCapabilities,
  getSessionOriginRuntimeLabel,
  getSessionResumeStatusLabel
} from "../../../../lib/sessionRuntime";

export interface CurrentSessionPanelViewModel {
  sessionDescription?: string;
  workspaceInfoMessage: string | null;
  importedInfoMessage: string | null;
  resumeInfoMessage: string | null;
  composerDisabled: boolean;
  composerPlaceholder: string;
  openActionsDisabled: boolean;
  openTerminalDisabled: boolean;
  stopButtonDisabled: boolean;
}

export function buildCurrentSessionPanelViewModel(input: {
  selectedSession: SessionRecord | null;
  stoppingSession: boolean;
}): CurrentSessionPanelViewModel {
  const { selectedSession, stoppingSession } = input;
  const isImportedCliSession = selectedSession?.origin === "imported_cli";
  const sessionCapabilities = getSessionCapabilities(selectedSession);
  const sessionResumeLabel = getSessionResumeStatusLabel(selectedSession);

  const sessionDescription = selectedSession
    ? `Provider: ${selectedSession.provider} · ${getSessionOriginRuntimeLabel(selectedSession)}`
    : undefined;

  const workspaceInfoMessage = selectedSession
    ? `当前会话工作区：${selectedSession.sourcePath ?? "使用项目根路径"}。${
        sessionCapabilities.canAttachTerminal
          ? " 可以从这里直接打开绑定终端，保持同一条 session 的上下文。"
          : " 当前还不能附着终端。"
      }`
    : null;

  const importedInfoMessage = isImportedCliSession
    ? `${
        sessionCapabilities.canSendMessages
          ? "这条会话来自本机 CLI 历史记录，当前已经支持继续发送；后续会继续把它打磨成真正的一等 session 工作台。"
          : "这条会话来自本机 CLI 历史记录，当前仍处于只读观察模式。"
      }${sessionResumeLabel ? ` ${sessionResumeLabel}。` : ""}`
    : null;

  const composerDisabled = !selectedSession || !sessionCapabilities.canSendMessages;
  const openActionsDisabled = !selectedSession;

  return {
    sessionDescription,
    workspaceInfoMessage,
    importedInfoMessage,
    resumeInfoMessage: !isImportedCliSession && sessionResumeLabel ? sessionResumeLabel : null,
    composerDisabled,
    composerPlaceholder: isImportedCliSession
      ? sessionCapabilities.canSendMessages
        ? "继续对这条本机 CLI 会话发送消息"
        : "这个 CLI provider 当前仍是只读，后续会接入继续发送"
      : "输入你要交给 Agent 的任务",
    openActionsDisabled,
    openTerminalDisabled: !selectedSession || !sessionCapabilities.canAttachTerminal,
    stopButtonDisabled:
      !selectedSession ||
      stoppingSession ||
      (isImportedCliSession && !sessionCapabilities.canSendMessages)
  };
}
