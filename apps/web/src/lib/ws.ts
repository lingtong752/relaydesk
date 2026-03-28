import type { RealtimeEvent } from "@shared";
import { getApiBaseUrl } from "./api";

export type RealtimeConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export interface RealtimeClient {
  subscribe(channel: string): void;
  close(): void;
  getState(): RealtimeConnectionState;
}

interface RealtimeOptions {
  onEvent: (event: RealtimeEvent) => void;
  onConnectionStateChange?: (state: RealtimeConnectionState) => void;
  onReconnect?: () => void;
  webSocketFactory?: (url: string) => WebSocket;
}

function normalizeOptions(
  options: RealtimeOptions | ((event: RealtimeEvent) => void)
): RealtimeOptions {
  if (typeof options === "function") {
    return { onEvent: options };
  }

  return options;
}

export function getReconnectDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 5000);
}

export function connectRealtime(
  token: string,
  input: RealtimeOptions | ((event: RealtimeEvent) => void)
): RealtimeClient {
  const options = normalizeOptions(input);
  const wsUrl = `${getApiBaseUrl().replace(/^http/, "ws")}/ws?token=${encodeURIComponent(token)}`;
  const createSocket = options.webSocketFactory ?? ((url: string) => new WebSocket(url));
  const subscriptions = new Set<string>();
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;
  let hasOpened = false;
  let manuallyClosed = false;
  let currentState: RealtimeConnectionState = "connecting";

  function updateState(state: RealtimeConnectionState): void {
    currentState = state;
    options.onConnectionStateChange?.(state);
  }

  function sendSubscription(channel: string): void {
    if (!socket || socket.readyState !== socket.OPEN) {
      return;
    }

    socket.send(JSON.stringify({ type: "subscribe", channel }));
  }

  function flushSubscriptions(): void {
    for (const channel of subscriptions) {
      sendSubscription(channel);
    }
  }

  function scheduleReconnect(): void {
    if (manuallyClosed || reconnectTimer) {
      return;
    }

    updateState("reconnecting");
    const delay = getReconnectDelay(reconnectAttempt);
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  function connect(): void {
    socket = createSocket(wsUrl);
    updateState(hasOpened ? "reconnecting" : "connecting");

    socket.addEventListener("open", () => {
      const reconnected = hasOpened;
      hasOpened = true;
      reconnectAttempt = 0;
      updateState("connected");
      flushSubscriptions();
      if (reconnected) {
        options.onReconnect?.();
      }
    });

    socket.addEventListener("message", (event) => {
      try {
        const parsed = JSON.parse(event.data) as RealtimeEvent;
        options.onEvent(parsed);
      } catch {
        // Ignore malformed payloads for now.
      }
    });

    socket.addEventListener("close", () => {
      socket = null;
      if (manuallyClosed) {
        updateState("disconnected");
        return;
      }

      scheduleReconnect();
    });

    socket.addEventListener("error", () => {
      if (socket && socket.readyState !== socket.CLOSED && socket.readyState !== socket.CLOSING) {
        socket.close();
      }
    });
  }

  connect();

  return {
    subscribe(channel: string) {
      if (subscriptions.has(channel)) {
        return;
      }

      subscriptions.add(channel);
      sendSubscription(channel);
    },
    close() {
      manuallyClosed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      socket?.close();
      updateState("disconnected");
    },
    getState() {
      return currentState;
    }
  };
}
