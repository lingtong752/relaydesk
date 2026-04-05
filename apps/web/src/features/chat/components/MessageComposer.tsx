import { useRef } from "react";
import {
  canSubmitMessageDraft,
  shouldSubmitMessageComposerOnEnter
} from "./messageComposer/utils";

interface MessageComposerProps {
  disabled: boolean;
  messageDraft: string;
  placeholder?: string;
  onDraftChange(value: string): void;
  onSubmit(event: React.FormEvent<HTMLFormElement>): void | Promise<void>;
}

export function MessageComposer({
  disabled,
  messageDraft,
  placeholder,
  onDraftChange,
  onSubmit
}: MessageComposerProps): JSX.Element {
  const formRef = useRef<HTMLFormElement | null>(null);
  const submitEnabled = canSubmitMessageDraft({ disabled, messageDraft });

  return (
    <form className="chat-form" onSubmit={onSubmit} ref={formRef}>
      <div className="chat-form-hint">Enter 发送 · Shift + Enter 换行</div>
      <textarea
        disabled={disabled}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={(event) => {
          if (
            !shouldSubmitMessageComposerOnEnter({
              key: event.key,
              shiftKey: event.shiftKey,
              disabled,
              messageDraft
            })
          ) {
            return;
          }

          event.preventDefault();
          formRef.current?.requestSubmit();
        }}
        placeholder={placeholder ?? "输入你要交给 Agent 的任务"}
        rows={4}
        value={messageDraft}
      />
      <div className="chat-form-actions">
        <button className="primary-button" disabled={!submitEnabled} type="submit">
          发送消息
        </button>
      </div>
    </form>
  );
}
