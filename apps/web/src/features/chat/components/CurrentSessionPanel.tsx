import type { SessionRecord, MessageRecord } from "@shared";
import { MessageComposer } from "./MessageComposer";
import { MessageList } from "./MessageList";
import { SectionHeader } from "../../../shared/ui/SectionHeader";
import {
  getSessionCapabilities,
  getSessionOriginRuntimeLabel,
  getSessionResumeStatusLabel
} from "../../../lib/sessionRuntime";

interface CurrentSessionPanelProps {
  combinedError: string | null;
  messageDraft: string;
  messages: MessageRecord[];
  selectedSession: SessionRecord | null;
  stoppingSession: boolean;
  onOpenFiles(): void;
  onOpenGit(): void;
  onOpenTerminal(): void;
  onDraftChange(value: string): void;
  onStopSession(): void;
  onSubmit(event: React.FormEvent<HTMLFormElement>): void | Promise<void>;
}

export function CurrentSessionPanel({
  combinedError,
  messageDraft,
  messages,
  selectedSession,
  stoppingSession,
  onOpenFiles,
  onOpenGit,
  onOpenTerminal,
  onDraftChange,
  onStopSession,
  onSubmit
}: CurrentSessionPanelProps): JSX.Element {
  const isImportedCliSession = selectedSession?.origin === "imported_cli";
  const sessionCapabilities = getSessionCapabilities(selectedSession);
  const sessionResumeLabel = getSessionResumeStatusLabel(selectedSession);

  return (
    <section className="chat-panel">
      <SectionHeader
        actions={
          <div className="section-actions">
            <button
              className="secondary-button"
              disabled={!selectedSession}
              onClick={onOpenFiles}
              type="button"
            >
              跳到文件
            </button>
            <button
              className="secondary-button"
              disabled={!selectedSession}
              onClick={onOpenGit}
              type="button"
            >
              跳到 Git
            </button>
            <button
              className="secondary-button"
              disabled={!selectedSession || !sessionCapabilities.canAttachTerminal}
              onClick={onOpenTerminal}
              type="button"
            >
              打开绑定终端
            </button>
            <button
              className="secondary-button"
              disabled={
                !selectedSession ||
                stoppingSession ||
                (isImportedCliSession && !sessionCapabilities.canSendMessages)
              }
              onClick={onStopSession}
              type="button"
            >
              {stoppingSession ? "停止中..." : "停止当前输出"}
            </button>
          </div>
        }
        description={
          selectedSession
            ? `Provider: ${selectedSession.provider} · ${getSessionOriginRuntimeLabel(selectedSession)}`
            : undefined
        }
        eyebrow="当前会话"
        title={selectedSession?.title ?? "请选择会话"}
      />

      {combinedError ? <div className="error-box">{combinedError}</div> : null}
      {selectedSession ? (
        <div className="info-box">
          当前会话工作区：{selectedSession.sourcePath ?? "使用项目根路径"}。
          {sessionCapabilities.canAttachTerminal
            ? " 可以从这里直接打开绑定终端，保持同一条 session 的上下文。"
            : " 当前还不能附着终端。"}
        </div>
      ) : null}
      {isImportedCliSession ? (
        <div className="info-box">
          {sessionCapabilities.canSendMessages
            ? "这条会话来自本机 CLI 历史记录，当前已经支持继续发送；后续会继续把它打磨成真正的一等 session 工作台。"
            : "这条会话来自本机 CLI 历史记录，当前仍处于只读观察模式。"}
          {sessionResumeLabel ? ` ${sessionResumeLabel}。` : ""}
        </div>
      ) : sessionResumeLabel ? <div className="info-box">{sessionResumeLabel}</div> : null}

      <MessageList messages={messages} />
      <MessageComposer
        disabled={!selectedSession || !sessionCapabilities.canSendMessages}
        messageDraft={messageDraft}
        placeholder={
          isImportedCliSession
            ? sessionCapabilities.canSendMessages
              ? "继续对这条本机 CLI 会话发送消息"
              : "这个 CLI provider 当前仍是只读，后续会接入继续发送"
            : "输入你要交给 Agent 的任务"
        }
        onDraftChange={onDraftChange}
        onSubmit={onSubmit}
      />
    </section>
  );
}
