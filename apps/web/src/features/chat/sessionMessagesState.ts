import type { MessageRecord, RealtimeEvent } from "@shared";

export function mergeMessages(
  current: MessageRecord[],
  incoming: MessageRecord
): MessageRecord[] {
  const existing = current.find((item) => item.id === incoming.id);
  if (!existing) {
    return [...current, incoming].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt)
    );
  }

  return current.map((item) => (item.id === incoming.id ? incoming : item));
}

export function applyRealtimeEventToMessages(input: {
  current: MessageRecord[];
  event: RealtimeEvent;
  selectedSessionId: string;
}): MessageRecord[] {
  const { current, event, selectedSessionId } = input;

  if (
    event.type === "message.created" &&
    event.payload.message.sessionId === selectedSessionId
  ) {
    return mergeMessages(current, event.payload.message);
  }

  if (event.type === "message.delta") {
    return current.map((item) =>
      item.id === event.payload.messageId
        ? {
            ...item,
            content: `${item.content}${event.payload.delta}`,
            status: "streaming"
          }
        : item
    );
  }

  if (
    event.type === "message.completed" &&
    event.payload.message.sessionId === selectedSessionId
  ) {
    return mergeMessages(current, event.payload.message);
  }

  return current;
}

export function normalizeMessageDraftForSend(messageDraft: string): string {
  return messageDraft.trim();
}
