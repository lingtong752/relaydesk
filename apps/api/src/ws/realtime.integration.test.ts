import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { RealtimeEvent, RunRecord } from "@shared";
import { createApp } from "../app.js";
import { createInMemoryDatabase } from "../testUtils/inMemoryDatabase.js";

type InjectedWebSocket = Awaited<ReturnType<FastifyInstance["injectWS"]>>;

function attachEventCollector(socket: InjectedWebSocket): RealtimeEvent[] {
  const events: RealtimeEvent[] = [];
  socket.on("message", (data: Buffer) => {
    events.push(JSON.parse(data.toString()) as RealtimeEvent);
  });
  return events;
}

describe("realtime websocket integration", () => {
  let app: FastifyInstance;
  let token: string;

  beforeEach(async () => {
    app = await createApp({
      db: createInMemoryDatabase(),
      jwtSecret: "integration-secret",
      logger: false
    });
    await app.ready();

    const registerResponse = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "realtime@example.com",
        password: "password123"
      }
    });
    token = (registerResponse.json() as { token: string }).token;
  });

  afterEach(async () => {
    await app.close();
  });

  it("delivers subscription acks and project events across websocket reconnects", async () => {
    const channel = "project:demo";
    const subscribeSpy = vi.spyOn(app.hub, "subscribe");
    const ws1 = await app.injectWS("/ws", {
      headers: { authorization: `Bearer ${token}` }
    });
    const firstEvents = attachEventCollector(ws1);

    ws1.send(JSON.stringify({ type: "subscribe", channel }));
    await expect.poll(() => subscribeSpy.mock.calls.length).toBe(1);

    app.hub.publish(channel, {
      type: "run.updated",
      payload: {
        run: {
          id: "run-demo",
          projectId: "project-demo",
          sessionId: "session-demo",
          provider: "mock",
          objective: "验证实时更新",
          constraints: "保持保守推进",
          status: "running",
          startedAt: "2026-03-28T00:00:00.000Z",
          updatedAt: "2026-03-28T00:00:00.000Z"
        } satisfies RunRecord
      }
    });

    await expect
      .poll(
        () =>
          firstEvents.some(
            (event) => event.type === "run.updated" && event.payload.run.status === "running"
          )
      )
      .toBe(true);

    ws1.terminate();

    const ws2 = await app.injectWS("/ws", {
      headers: { authorization: `Bearer ${token}` }
    });
    const secondEvents = attachEventCollector(ws2);
    ws2.send(JSON.stringify({ type: "subscribe", channel }));
    await expect.poll(() => subscribeSpy.mock.calls.length).toBe(2);

    app.hub.publish(channel, {
      type: "run.updated",
      payload: {
        run: {
          id: "run-demo",
          projectId: "project-demo",
          sessionId: "session-demo",
          provider: "mock",
          objective: "验证实时更新",
          constraints: "保持保守推进",
          status: "waiting_human",
          startedAt: "2026-03-28T00:00:00.000Z",
          updatedAt: "2026-03-28T00:01:00.000Z"
        } satisfies RunRecord
      }
    });

    await expect
      .poll(
        () =>
          secondEvents.some(
            (event) =>
              event.type === "run.updated" && event.payload.run.status === "waiting_human"
          )
      )
      .toBe(true);

    expect(
      firstEvents.some(
        (event) => event.type === "run.updated" && event.payload.run.status === "waiting_human"
      )
    ).toBe(false);

    ws2.terminate();
  });
});
