import { describe, expect, it, vi } from "vitest";
import { SessionHub } from "./sessionHub.js";

function createFakeSocket() {
  return {
    OPEN: 1,
    readyState: 1,
    send: vi.fn()
  } as unknown as WebSocket;
}

describe("SessionHub", () => {
  it("publishes events to subscribed sockets", () => {
    const hub = new SessionHub();
    const socket = createFakeSocket();
    const sendMock = socket.send as unknown as ReturnType<typeof vi.fn>;

    hub.subscribe("session:test", socket);
    hub.publish("session:test", {
      type: "error",
      payload: { message: "boom" }
    });

    expect(sendMock.mock.calls[0]?.[0]).toContain("boom");
  });

  it("removes sockets from all channels on unsubscribe", () => {
    const hub = new SessionHub();
    const socket = createFakeSocket();
    const sendMock = socket.send as unknown as ReturnType<typeof vi.fn>;

    hub.subscribe("session:test", socket);
    hub.unsubscribeSocket(socket);
    hub.publish("session:test", {
      type: "error",
      payload: { message: "should not be delivered" }
    });

    expect(sendMock.mock.calls.length).toBe(0);
  });
});
