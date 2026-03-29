import { useEffect, useRef, useState } from "react";
import type { ApprovalRecord, RealtimeEvent, RunRecord } from "@shared";
import { connectRealtime, type RealtimeClient, type RealtimeConnectionState } from "../../lib/ws";

interface UseProjectRealtimeOptions {
  projectId: string;
  token: string | null;
  onReconnect(): void;
  onRunUpdated(run: RunRecord | null): void;
  onApprovalUpdated(approval: ApprovalRecord): void;
}

interface UseProjectRealtimeResult {
  realtimeState: RealtimeConnectionState;
  wsClient: RealtimeClient | null;
  lastRealtimeEvent: RealtimeEvent | null;
}

export function useProjectRealtime({
  projectId,
  token,
  onReconnect,
  onRunUpdated,
  onApprovalUpdated
}: UseProjectRealtimeOptions): UseProjectRealtimeResult {
  const [realtimeState, setRealtimeState] = useState<RealtimeConnectionState>("connecting");
  const [wsClient, setWsClient] = useState<RealtimeClient | null>(null);
  const [lastRealtimeEvent, setLastRealtimeEvent] = useState<RealtimeEvent | null>(null);
  const reconnectRef = useRef(onReconnect);
  const runUpdatedRef = useRef(onRunUpdated);
  const approvalUpdatedRef = useRef(onApprovalUpdated);

  useEffect(() => {
    reconnectRef.current = onReconnect;
  }, [onReconnect]);

  useEffect(() => {
    runUpdatedRef.current = onRunUpdated;
  }, [onRunUpdated]);

  useEffect(() => {
    approvalUpdatedRef.current = onApprovalUpdated;
  }, [onApprovalUpdated]);

  useEffect(() => {
    if (!token) {
      setWsClient(null);
      setLastRealtimeEvent(null);
      setRealtimeState("disconnected");
      return;
    }

    setLastRealtimeEvent(null);
    const client = connectRealtime(token, {
      onEvent: (event) => {
        setLastRealtimeEvent(event);

        if (event.type === "run.updated") {
          runUpdatedRef.current(event.payload.run);
        }

        if (event.type === "approval.updated") {
          approvalUpdatedRef.current(event.payload.approval);
        }
      },
      onConnectionStateChange: setRealtimeState,
      onReconnect: () => reconnectRef.current()
    });

    if (projectId) {
      client.subscribe(`project:${projectId}`);
    }

    setWsClient(client);
    return () => {
      setWsClient(null);
      client.close();
    };
  }, [projectId, token]);

  return {
    realtimeState,
    wsClient,
    lastRealtimeEvent
  };
}
