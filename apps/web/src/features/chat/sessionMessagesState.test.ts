import { describe, expect, it } from "vitest";
import type { MessageRecord, RealtimeEvent } from "@shared";
import {
  applyRealtimeEventToMessages,
  mergeMessages,
  normalizeMessageDraftForSend
} from "./sessionMessagesState";

function createMessage(overrides: Partial<MessageRecord> = {}): MessageRecord {
  return {
    id: "message-default",
    sessionId: "session-1",
    projectId: "project-1",
    role: "human",
    senderType: "user",
    content: "hello",
    status: "completed",
    createdAt: "2026-04-05T10:00:00.000Z",
    updatedAt: "2026-04-05T10:00:00.000Z",
    ...overrides
  };
}

describe("sessionMessagesState", () => {
  it("merges new and existing messages in createdAt order", () => {
    const current = [
      createMessage({
        id: "message-2",
        createdAt: "2026-04-05T10:02:00.000Z"
      })
    ];
    const merged = mergeMessages(
      current,
      createMessage({
        id: "message-1",
        createdAt: "2026-04-05T10:01:00.000Z"
      })
    );

    expect(merged.map((message) => message.id)).toEqual(["message-1", "message-2"]);

    const updated = mergeMessages(
      merged,
      createMessage({
        id: "message-2",
        content: "updated"
      })
    );
    expect(updated.find((message) => message.id === "message-2")?.content).toBe("updated");
  });

  it("applies message.created and message.completed only for selected session", () => {
    const base = [createMessage({ id: "message-1", sessionId: "session-1" })];
    const createdEvent: RealtimeEvent = {
      type: "message.created",
      payload: {
        message: createMessage({
          id: "message-2",
          sessionId: "session-1",
          createdAt: "2026-04-05T10:02:00.000Z"
        })
      }
    };
    const created = applyRealtimeEventToMessages({
      current: base,
      event: createdEvent,
      selectedSessionId: "session-1"
    });
    expect(created.map((message) => message.id)).toEqual(["message-1", "message-2"]);

    const ignored = applyRealtimeEventToMessages({
      current: base,
      event: {
        type: "message.completed",
        payload: {
          message: createMessage({ id: "message-3", sessionId: "session-other" })
        }
      },
      selectedSessionId: "session-1"
    });
    expect(ignored).toBe(base);
  });

  it("applies message.delta updates as streaming content append", () => {
    const current = [
      createMessage({
        id: "message-1",
        content: "hello",
        status: "pending"
      })
    ];
    const updated = applyRealtimeEventToMessages({
      current,
      event: {
        type: "message.delta",
        payload: {
          messageId: "message-1",
          delta: " world"
        }
      },
      selectedSessionId: "session-1"
    });

    expect(updated[0]).toEqual(
      expect.objectContaining({
        content: "hello world",
        status: "streaming"
      })
    );
  });

  it("normalizes message draft text before sending", () => {
    expect(normalizeMessageDraftForSend("  hello world  ")).toBe("hello world");
    expect(normalizeMessageDraftForSend("   ")).toBe("");
  });
});
