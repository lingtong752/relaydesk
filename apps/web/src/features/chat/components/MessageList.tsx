import type { MessageRecord } from "@shared";
import { EmptyState } from "../../../shared/ui/EmptyState";
import { MessageContent } from "./MessageContent";

interface MessageListProps {
  messages: MessageRecord[];
}

function getMessageRoleLabel(role: MessageRecord["role"]): string {
  if (role === "human") {
    return "你";
  }

  if (role === "provider") {
    return "Codex";
  }

  if (role === "surrogate") {
    return "替身";
  }

  if (role === "system") {
    return "系统";
  }

  return role;
}

export function MessageList({ messages }: MessageListProps): JSX.Element {
  return (
    <div className="message-list">
      {messages.length === 0 ? <EmptyState message="会话还没有消息，先发一条试试。" /> : null}
      {messages.map((message) => {
        const roleLabel = getMessageRoleLabel(message.role);
        const isHuman = message.role === "human";

        return (
          <article className={`message-card role-${message.role} ${isHuman ? "is-human" : "is-assistant"}`} key={message.id}>
            <header className="message-card-head">
              <strong>{roleLabel}</strong>
              <span>{new Date(message.createdAt).toLocaleTimeString()}</span>
            </header>
            <MessageContent content={message.content || (message.status === "streaming" ? "..." : "")} />
          </article>
        );
      })}
    </div>
  );
}
