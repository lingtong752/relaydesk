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
  return (
    <form className="chat-form" onSubmit={onSubmit}>
      <textarea
        disabled={disabled}
        onChange={(event) => onDraftChange(event.target.value)}
        placeholder={placeholder ?? "输入你要交给 Agent 的任务"}
        rows={4}
        value={messageDraft}
      />
      <button className="primary-button" disabled={disabled || !messageDraft.trim()} type="submit">
        发送
      </button>
    </form>
  );
}
