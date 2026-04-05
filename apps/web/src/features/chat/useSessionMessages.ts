import { useEffect, useState } from "react";
import type { MessageRecord, RealtimeEvent } from "@shared";
import { api } from "../../lib/api";
import type { RealtimeClient } from "../../lib/ws";
import {
  applyRealtimeEventToMessages,
  normalizeMessageDraftForSend
} from "./sessionMessagesState";

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

    setMessages((current) =>
      applyRealtimeEventToMessages({
        current,
        event: lastRealtimeEvent,
        selectedSessionId
      })
    );
  }, [lastRealtimeEvent, selectedSessionId]);

  async function sendMessage(): Promise<void> {
    const normalizedDraft = normalizeMessageDraftForSend(messageDraft);
    if (!token || !selectedSessionId || !normalizedDraft) {
      return;
    }

    clearChatError();
    try {
      await api.sendMessage(token, selectedSessionId, { content: normalizedDraft });
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
