import type { MessageRecord } from "@shared";
import { EmptyState } from "../../../shared/ui/EmptyState";
import { MessageContent } from "./MessageContent";

interface MessageListProps {
  messages: MessageRecord[];
}

export function MessageList({ messages }: MessageListProps): JSX.Element {
  return (
    <div className="message-list">
      {messages.length === 0 ? <EmptyState message="会话还没有消息，先发一条试试。" /> : null}
      {messages.map((message) => (
        <article className={`message-card role-${message.role}`} key={message.id}>
          <header>
            <strong>{message.role}</strong>
            <span>{new Date(message.createdAt).toLocaleTimeString()}</span>
          </header>
          <MessageContent content={message.content || (message.status === "streaming" ? "..." : "")} />
        </article>
      ))}
    </div>
  );
}
