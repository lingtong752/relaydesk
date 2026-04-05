import type { SessionRecord, MessageRecord } from "@shared";
import { MessageComposer } from "./MessageComposer";
import { MessageList } from "./MessageList";
import { SectionHeader } from "../../../shared/ui/SectionHeader";
import { buildCurrentSessionPanelViewModel } from "./currentSessionPanel/viewModel";

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
  const viewModel = buildCurrentSessionPanelViewModel({
    selectedSession,
    stoppingSession
  });

  return (
    <section className="chat-panel">
      <SectionHeader
        actions={
          <div className="section-actions">
            <button
              className="secondary-button"
              disabled={viewModel.openActionsDisabled}
              onClick={onOpenFiles}
              type="button"
            >
              跳到文件
            </button>
            <button
              className="secondary-button"
              disabled={viewModel.openActionsDisabled}
              onClick={onOpenGit}
              type="button"
            >
              跳到 Git
            </button>
            <button
              className="secondary-button"
              disabled={viewModel.openTerminalDisabled}
              onClick={onOpenTerminal}
              type="button"
            >
              打开绑定终端
            </button>
            <button
              className="secondary-button"
              disabled={viewModel.stopButtonDisabled}
              onClick={onStopSession}
              type="button"
            >
              {stoppingSession ? "停止中..." : "停止当前输出"}
            </button>
          </div>
        }
        description={viewModel.sessionDescription}
        eyebrow="当前会话"
        title={selectedSession?.title ?? "请选择会话"}
      />

      {combinedError ? <div className="error-box">{combinedError}</div> : null}
      {viewModel.workspaceInfoMessage ? <div className="info-box">{viewModel.workspaceInfoMessage}</div> : null}
      {viewModel.importedInfoMessage ? <div className="info-box">{viewModel.importedInfoMessage}</div> : null}
      {viewModel.resumeInfoMessage ? <div className="info-box">{viewModel.resumeInfoMessage}</div> : null}

      <MessageList messages={messages} />
      <MessageComposer
        disabled={viewModel.composerDisabled}
        messageDraft={messageDraft}
        placeholder={viewModel.composerPlaceholder}
        onDraftChange={onDraftChange}
        onSubmit={onSubmit}
      />
    </section>
  );
}
