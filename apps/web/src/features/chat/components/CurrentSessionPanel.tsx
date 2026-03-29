import type { SessionRecord, MessageRecord } from "@shared";
import { MessageComposer } from "./MessageComposer";
import { MessageList } from "./MessageList";
import { SectionHeader } from "../../../shared/ui/SectionHeader";

interface CurrentSessionPanelProps {
  combinedError: string | null;
  messageDraft: string;
  messages: MessageRecord[];
  selectedSession: SessionRecord | null;
  stoppingSession: boolean;
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
  onDraftChange,
  onStopSession,
  onSubmit
}: CurrentSessionPanelProps): JSX.Element {
  const isImportedCliSession = selectedSession?.origin === "imported_cli";
  const canContinueImportedCliSession =
    isImportedCliSession &&
    !!selectedSession &&
    ["claude", "codex", "gemini"].includes(selectedSession.provider);

  return (
    <section className="chat-panel">
      <SectionHeader
        actions={
          <button
            className="secondary-button"
            disabled={
              !selectedSession ||
              stoppingSession ||
              (isImportedCliSession && !canContinueImportedCliSession)
            }
            onClick={onStopSession}
            type="button"
          >
            {stoppingSession ? "停止中..." : "停止当前输出"}
          </button>
        }
        description={
          selectedSession
            ? isImportedCliSession
              ? canContinueImportedCliSession
                ? `Provider: ${selectedSession.provider} · CLI 历史会话（可继续发送）`
                : `Provider: ${selectedSession.provider} · CLI 历史会话（只读）`
              : `Provider: ${selectedSession.provider}`
            : undefined
        }
        eyebrow="当前会话"
        title={selectedSession?.title ?? "请选择会话"}
      />

      {combinedError ? <div className="error-box">{combinedError}</div> : null}
      {isImportedCliSession ? (
        <div className="info-box">
          {canContinueImportedCliSession
            ? "这条会话来自本机 CLI 历史记录，当前已经支持继续发送；如果你切到替身页，也可以直接叠加到真实 CLI 会话之上运行。"
            : "这条会话来自本机 CLI 历史记录，当前支持查看上下文；这个 provider 的继续发送能力还没有接进来。"}
        </div>
      ) : null}

      <MessageList messages={messages} />
      <MessageComposer
        disabled={!selectedSession || (isImportedCliSession && !canContinueImportedCliSession)}
        messageDraft={messageDraft}
        placeholder={
          isImportedCliSession
            ? canContinueImportedCliSession
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
