import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { ObjectId } from "mongodb";
import { createApp } from "../app.js";
import type { TerminalSessionRecord } from "@shared";
import { createInMemoryDatabase } from "../testUtils/inMemoryDatabase.js";
import { TerminalManager, TerminalManagerError } from "../services/terminalManager.js";

type TerminalEvent =
  | {
      type: "terminal.ready";
      payload: {
        backlog: string;
        session: {
          id: string;
          projectId: string;
          cwd: string;
          shell: string;
          backendType: TerminalSessionRecord["backendType"];
          provider?: TerminalSessionRecord["provider"];
          attachMode?: TerminalSessionRecord["attachMode"];
          supportsInput: boolean;
          supportsResize: boolean;
          fallbackReason?: string | null;
          sourceSession?: TerminalSessionRecord["sourceSession"];
          createdAt: string;
        };
      };
    }
  | {
      type: "terminal.output";
      payload: { data: string };
    }
  | {
      type: "terminal.error";
      payload: { message: string };
    };

async function openTerminalSocket(
  app: FastifyInstance,
  socketPath: string
): Promise<{ socket: Awaited<ReturnType<FastifyInstance["injectWS"]>>; events: TerminalEvent[] }> {
  const events: TerminalEvent[] = [];
  const socket = await app.injectWS(socketPath, {}, {
    onOpen(openSocket) {
      openSocket.on("message", (data: Buffer) => {
        events.push(JSON.parse(data.toString()) as TerminalEvent);
      });
    }
  });

  return { socket, events };
}

interface FakeTerminalSession {
  ownerId: string;
  record: TerminalSessionRecord;
  backlog: string;
  sockets: Set<WebSocket>;
}

class FakeTerminalManager extends TerminalManager {
  private readonly fakeSessions = new Map<string, FakeTerminalSession>();

  override async createSession(input: {
    ownerId: string;
    projectId: string;
    cwd: string;
    sourceSession?: TerminalSessionRecord["sourceSession"];
    backend?: Partial<
      Pick<
        TerminalSessionRecord,
        "backendType" | "provider" | "attachMode" | "supportsInput" | "supportsResize" | "fallbackReason"
      >
    >;
  }): Promise<TerminalSessionRecord> {
    const session: FakeTerminalSession = {
      ownerId: input.ownerId,
      record: {
        id: `terminal-${this.fakeSessions.size + 1}`,
        projectId: input.projectId,
        cwd: input.cwd,
        shell: "/bin/fake-sh",
        backendType: input.backend?.backendType ?? "shell",
        provider: input.backend?.provider,
        attachMode: input.backend?.attachMode ?? "direct_shell",
        supportsInput: input.backend?.supportsInput ?? true,
        supportsResize: input.backend?.supportsResize ?? true,
        fallbackReason: input.backend?.fallbackReason ?? null,
        sourceSession: input.sourceSession,
        createdAt: new Date().toISOString()
      },
      backlog: "",
      sockets: new Set()
    };

    this.fakeSessions.set(session.record.id, session);
    return session.record;
  }

  override attachSocket(
    sessionId: string,
    ownerId: string,
    socket: WebSocket
  ): ReturnType<TerminalManager["attachSocket"]> {
    const session = this.getOwnedSession(sessionId, ownerId);
    session.sockets.add(socket);
    socket.send(
      JSON.stringify({
        type: "terminal.ready",
        payload: {
          session: session.record,
          backlog: session.backlog
        }
      })
    );

    return session as unknown as ReturnType<TerminalManager["attachSocket"]>;
  }

  override detachSocket(sessionId: string, socket: WebSocket): void {
    this.fakeSessions.get(sessionId)?.sockets.delete(socket);
  }

  override writeInput(sessionId: string, ownerId: string, input: string): void {
    const session = this.getOwnedSession(sessionId, ownerId);
    session.backlog = `${session.backlog}${input}`;

    const normalizedInput = input.replace(/\r?\n/g, "");
    const payload = JSON.stringify({
      type: "terminal.output",
      payload: {
        data: `${normalizedInput}\n`
      }
    });

    for (const socket of session.sockets) {
      if (socket.readyState === socket.OPEN) {
        socket.send(payload);
      }
    }
  }

  override resize(sessionId: string, ownerId: string, cols: number, rows: number): void {
    this.getOwnedSession(sessionId, ownerId);
    if (cols < 20 || rows < 8) {
      throw new TerminalManagerError(400, "Terminal size is too small");
    }
  }

  override listSessions(projectId: string, ownerId: string): TerminalSessionRecord[] {
    return Array.from(this.fakeSessions.values())
      .filter((session) => session.record.projectId === projectId && session.ownerId === ownerId)
      .map((session) => session.record);
  }

  override findSessionBySourceSession(
    projectId: string,
    ownerId: string,
    sourceSessionId: string
  ): TerminalSessionRecord | null {
    const session = Array.from(this.fakeSessions.values()).find(
      (entry) =>
        entry.record.projectId === projectId &&
        entry.ownerId === ownerId &&
        entry.record.sourceSession?.id === sourceSessionId
    );

    return session?.record ?? null;
  }

  override closeSession(sessionId: string, ownerId: string): void {
    this.getOwnedSession(sessionId, ownerId);
    this.destroySession(sessionId);
  }

  override destroySession(sessionId: string): void {
    const session = this.fakeSessions.get(sessionId);
    if (!session) {
      return;
    }

    for (const socket of session.sockets) {
      if (socket.readyState === socket.OPEN) {
        socket.close();
      }
    }

    this.fakeSessions.delete(sessionId);
  }

  private getOwnedSession(sessionId: string, ownerId: string): FakeTerminalSession {
    const session = this.fakeSessions.get(sessionId);
    if (!session || session.ownerId !== ownerId) {
      throw new TerminalManagerError(404, "Terminal session not found");
    }

    return session;
  }
}

describe("terminal websocket integration", () => {
  let app: FastifyInstance;
  let token: string;
  let sessionId: string | null = null;
  const terminalManager = new FakeTerminalManager();

  beforeEach(async () => {
    app = await createApp({
      db: createInMemoryDatabase(),
      jwtSecret: "terminal-secret",
      logger: false,
      terminalManager
    });
    await app.ready();

    const registerResponse = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "terminal@example.com",
        password: "password123"
      }
    });
    token = (registerResponse.json() as { token: string }).token;
  });

  afterEach(async () => {
    if (sessionId) {
      app.terminalManager.destroySession(sessionId);
    }

    await app.close();
  });

  it("replays terminal backlog across reconnects and reports invalid payloads", async () => {
    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: "Terminal Integration",
        rootPath: "/tmp/relaydesk-terminal-integration",
        providerPreferences: ["mock"]
      }
    });
    const projectId = (projectResponse.json() as { project: { id: string } }).project.id;

    const sessionResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/terminal/session`,
      headers: { authorization: `Bearer ${token}` }
    });
    if (sessionResponse.statusCode !== 200) {
      throw new Error(`Terminal session bootstrap failed: ${sessionResponse.body}`);
    }
    sessionId = (sessionResponse.json() as { session: { id: string } }).session.id;

    const { socket: ws1, events: firstEvents } = await openTerminalSocket(
      app,
      `/terminal?token=${encodeURIComponent(token)}&sessionId=${encodeURIComponent(sessionId)}`
    );

    await expect
      .poll(
        () =>
          firstEvents.find((event) => event.type === "terminal.ready")?.payload.session.id ?? null
      )
      .toBe(sessionId);

    ws1.send(JSON.stringify({ type: "input", payload: { data: "printf '__RELAYDESK_TERM__\\n'" } }));

    await expect
      .poll(
        () =>
          firstEvents.some(
            (event) =>
              event.type === "terminal.output" &&
              event.payload.data.includes("printf '__RELAYDESK_TERM__\\n'")
          )
      )
      .toBe(true);

    ws1.terminate();

    const { socket: ws2, events: secondEvents } = await openTerminalSocket(
      app,
      `/terminal?token=${encodeURIComponent(token)}&sessionId=${encodeURIComponent(sessionId)}`
    );

    await expect
      .poll(
        () =>
          secondEvents.find(
            (event) =>
              event.type === "terminal.ready" &&
              event.payload.backlog.includes("printf '__RELAYDESK_TERM__\\n'")
          )?.type ?? null
      )
      .toBe("terminal.ready");

    ws2.send("not-json");

    await expect
      .poll(
        () =>
          secondEvents.find(
            (event) =>
              event.type === "terminal.error" && event.payload.message === "Invalid terminal payload"
          )?.type ?? null
      )
      .toBe("terminal.error");

    const listResponse = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/terminal/sessions`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual({
      sessions: [
        expect.objectContaining({
          id: sessionId,
          projectId
        })
      ]
    });

    const closeResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/terminal/sessions/${sessionId}/close`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(closeResponse.statusCode).toBe(200);

    const listAfterCloseResponse = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/terminal/sessions`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(listAfterCloseResponse.statusCode).toBe(200);
    expect(listAfterCloseResponse.json()).toEqual({ sessions: [] });

    ws2.terminate();
  });

  it("reuses an attached terminal for the same workspace session", async () => {
    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: "Terminal Attachment",
        rootPath: "/tmp/relaydesk-terminal-attachment",
        providerPreferences: ["codex"]
      }
    });
    const projectId = (projectResponse.json() as { project: { id: string } }).project.id;

    const workspaceSessionResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/sessions`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        title: "会话 1",
        provider: "codex"
      }
    });
    const workspaceSessionId = (
      workspaceSessionResponse.json() as { session: { id: string } }
    ).session.id;

    const firstTerminalResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/terminal/session`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        sourceSessionId: workspaceSessionId
      }
    });
    expect(firstTerminalResponse.statusCode).toBe(200);
    const firstTerminal = firstTerminalResponse.json() as {
      session: TerminalSessionRecord;
    };
    sessionId = firstTerminal.session.id;

    expect(firstTerminal.session.sourceSession).toMatchObject({
      id: workspaceSessionId,
      title: "会话 1",
      provider: "codex",
      origin: "relaydesk",
      runtimeMode: "api_mode"
    });
    expect(firstTerminal.session).toMatchObject({
      backendType: "shell",
      provider: "codex",
      attachMode: "direct_shell",
      supportsInput: true,
      supportsResize: true
    });

    const secondTerminalResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/terminal/session`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        sourceSessionId: workspaceSessionId
      }
    });
    expect(secondTerminalResponse.statusCode).toBe(200);
    expect((secondTerminalResponse.json() as { session: { id: string } }).session.id).toBe(
      firstTerminal.session.id
    );

    const listResponse = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/terminal/sessions`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual({
      sessions: [
        expect.objectContaining({
          id: firstTerminal.session.id,
          backendType: "shell",
          sourceSession: expect.objectContaining({
            id: workspaceSessionId,
            provider: "codex"
          })
        })
      ]
    });
  });

  it("creates provider-cli terminal sessions for imported CLI sessions", async () => {
    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: "Imported Terminal Integration",
        rootPath: "/tmp/relaydesk-imported-terminal-integration",
        providerPreferences: ["claude"]
      }
    });
    const project = projectResponse.json() as { project: { id: string } };
    const projectObjectId = new ObjectId(project.project.id);
    const importedSessionId = new ObjectId();

    await app.db.collections.sessions.insertOne({
      _id: importedSessionId,
      projectId: projectObjectId,
      provider: "claude",
      title: "Imported Claude CLI",
      origin: "imported_cli",
      runtimeMode: "cli_session_mode",
      status: "idle",
      createdAt: new Date("2026-03-29T09:00:00.000Z"),
      updatedAt: new Date("2026-03-29T09:00:00.000Z")
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${project.project.id}/terminal/session`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        sourceSessionId: importedSessionId.toHexString()
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      session: expect.objectContaining({
        backendType: "provider_cli",
        provider: "claude",
        attachMode: "resume_bridge",
        supportsInput: true,
        supportsResize: true,
        fallbackReason: null,
        sourceSession: expect.objectContaining({
          id: importedSessionId.toHexString(),
          runtimeMode: "cli_session_mode",
          provider: "claude"
        })
      })
    });
  });

  it("returns stable negative contracts for terminal project guards", async () => {
    const authHeader = { authorization: `Bearer ${token}` };

    const invalidListResponse = await app.inject({
      method: "GET",
      url: "/api/projects/not-an-object-id/terminal/sessions",
      headers: authHeader
    });
    expect(invalidListResponse.statusCode).toBe(400);
    expect(invalidListResponse.json()).toEqual({
      message: "Invalid project id"
    });

    const invalidCreateResponse = await app.inject({
      method: "POST",
      url: "/api/projects/not-an-object-id/terminal/session",
      headers: authHeader
    });
    expect(invalidCreateResponse.statusCode).toBe(400);
    expect(invalidCreateResponse.json()).toEqual({
      message: "Invalid project id"
    });

    const invalidCloseResponse = await app.inject({
      method: "POST",
      url: "/api/projects/not-an-object-id/terminal/sessions/terminal-unknown/close",
      headers: authHeader
    });
    expect(invalidCloseResponse.statusCode).toBe(400);
    expect(invalidCloseResponse.json()).toEqual({
      message: "Invalid project id"
    });

    const missingProjectId = new ObjectId().toHexString();
    const missingListResponse = await app.inject({
      method: "GET",
      url: `/api/projects/${missingProjectId}/terminal/sessions`,
      headers: authHeader
    });
    expect(missingListResponse.statusCode).toBe(404);
    expect(missingListResponse.json()).toEqual({
      message: "Project not found"
    });
  });
});
