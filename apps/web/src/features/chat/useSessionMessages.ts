import { useEffect, useState } from "react";
import type { MessageRecord, RealtimeEvent } from "@shared";
import { api } from "../../lib/api";
import type { RealtimeClient } from "../../lib/ws";

function mergeMessages(current: MessageRecord[], incoming: MessageRecord): MessageRecord[] {
  const existing = current.find((item) => item.id === incoming.id);
  if (!existing) {
    return [...current, incoming].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  return current.map((item) => (item.id === incoming.id ? incoming : item));
}

interface UseSessionMessagesOptions {
  token: string | null;
  selectedSessionId: string;
  reconnectVersion: number;
  wsClient: RealtimeClient | null;
  lastRealtimeEvent: RealtimeEvent | null;
  clearWorkspaceError(): void;
}

interface SessionMessagesState {
  messages: MessageRecord[];
  messageDraft: string;
  pageError: string | null;
  stoppingSession: boolean;
  clearChatError(): void;
  setMessageDraft(value: string): void;
  sendMessage(): Promise<void>;
  stopSession(): Promise<void>;
}

export function useSessionMessages({
  token,
  selectedSessionId,
  reconnectVersion,
  wsClient,
  lastRealtimeEvent,
  clearWorkspaceError
}: UseSessionMessagesOptions): SessionMessagesState {
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [messageDraft, setMessageDraftState] = useState("");
  const [pageError, setPageError] = useState<string | null>(null);
  const [stoppingSession, setStoppingSession] = useState(false);

  function clearChatError(): void {
    clearWorkspaceError();
    setPageError(null);
  }

  function setMessageDraft(value: string): void {
    clearChatError();
    setMessageDraftState(value);
  }

  useEffect(() => {
    if (!token || !selectedSessionId || !wsClient) {
      setMessages([]);
      return;
    }

    let cancelled = false;
    wsClient.subscribe(`session:${selectedSessionId}`);
    void api
      .getMessages(token, selectedSessionId)
      .then((response) => {
        if (!cancelled) {
          setMessages(response.messages);
          setPageError(null);
        }
      })
      .catch((requestError) => {
        if (!cancelled) {
          setPageError(requestError instanceof Error ? requestError.message : "加载消息失败");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [reconnectVersion, selectedSessionId, token, wsClient]);

  useEffect(() => {
    if (!lastRealtimeEvent || !selectedSessionId) {
      return;
    }

    if (
      lastRealtimeEvent.type === "message.created" &&
      lastRealtimeEvent.payload.message.sessionId === selectedSessionId
    ) {
      setMessages((current) => mergeMessages(current, lastRealtimeEvent.payload.message));
      return;
    }

    if (lastRealtimeEvent.type === "message.delta") {
      setMessages((current) =>
        current.map((item) =>
          item.id === lastRealtimeEvent.payload.messageId
            ? { ...item, content: `${item.content}${lastRealtimeEvent.payload.delta}`, status: "streaming" }
            : item
        )
      );
      return;
    }

    if (
      lastRealtimeEvent.type === "message.completed" &&
      lastRealtimeEvent.payload.message.sessionId === selectedSessionId
    ) {
      setMessages((current) => mergeMessages(current, lastRealtimeEvent.payload.message));
    }
  }, [lastRealtimeEvent, selectedSessionId]);

  async function sendMessage(): Promise<void> {
    if (!token || !selectedSessionId || !messageDraft.trim()) {
      return;
    }

    clearChatError();
    try {
      await api.sendMessage(token, selectedSessionId, { content: messageDraft.trim() });
      setMessageDraftState("");
    } catch (sendError) {
      setPageError(sendError instanceof Error ? sendError.message : "发送失败");
    }
  }

  async function stopSession(): Promise<void> {
    if (!token || !selectedSessionId) {
      return;
    }

    clearChatError();
    setStoppingSession(true);
    try {
      await api.stopSession(token, selectedSessionId);
    } catch (stopError) {
      setPageError(stopError instanceof Error ? stopError.message : "停止输出失败");
    } finally {
      setStoppingSession(false);
    }
  }

  return {
    messages,
    messageDraft,
    pageError,
    stoppingSession,
    clearChatError,
    setMessageDraft,
    sendMessage,
    stopSession
  };
}
