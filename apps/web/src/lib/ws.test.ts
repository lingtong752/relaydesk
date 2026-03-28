import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectRealtime, getReconnectDelay } from "./ws.js";

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly CONNECTING = MockWebSocket.CONNECTING;
  readonly OPEN = MockWebSocket.OPEN;
  readonly CLOSING = MockWebSocket.CLOSING;
  readonly CLOSED = MockWebSocket.CLOSED;

  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  private readonly listeners = new Map<string, Set<(event?: MessageEvent) => void>>();

  addEventListener(type: string, listener: (event?: MessageEvent) => void): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }

    this.listeners.get(type)!.add(listener);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.emit("close");
  }

  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.emit("open");
  }

  message(data: unknown): void {
    this.emit("message", { data: JSON.stringify(data) } as MessageEvent);
  }

  private emit(type: string, event?: MessageEvent): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

describe("getReconnectDelay", () => {
  it("caps backoff at 5 seconds", () => {
    expect(getReconnectDelay(0)).toBe(1000);
    expect(getReconnectDelay(1)).toBe(2000);
    expect(getReconnectDelay(4)).toBe(5000);
  });
});

describe("connectRealtime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reconnects and re-subscribes channels after socket close", () => {
    const sockets: MockWebSocket[] = [];
    const states: string[] = [];
    const reconnectSpy = vi.fn();

    const client = connectRealtime("token", {
      onEvent: vi.fn(),
      onConnectionStateChange: (state) => states.push(state),
      onReconnect: reconnectSpy,
      webSocketFactory: () => {
        const socket = new MockWebSocket();
        sockets.push(socket);
        return socket as unknown as WebSocket;
      }
    });

    client.subscribe("project:demo");
    sockets[0]!.open();
    expect(sockets[0]!.sent).toContain(JSON.stringify({ type: "subscribe", channel: "project:demo" }));

    sockets[0]!.close();
    vi.advanceTimersByTime(1000);

    expect(sockets).toHaveLength(2);
    sockets[1]!.open();

    expect(reconnectSpy).toHaveBeenCalledTimes(1);
    expect(sockets[1]!.sent).toContain(JSON.stringify({ type: "subscribe", channel: "project:demo" }));
    expect(states).toContain("reconnecting");
    expect(client.getState()).toBe("connected");

    client.close();
    expect(client.getState()).toBe("disconnected");
  });
});
