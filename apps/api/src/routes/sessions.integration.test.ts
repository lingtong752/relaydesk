import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import type { FastifyInstance } from "fastify";
import type { SessionRecord } from "@shared";
import { createApp } from "../app.js";
import type { CliSessionRunner } from "../services/cliSessionRunner.js";
import { createInMemoryDatabase } from "../testUtils/inMemoryDatabase.js";

describe("session routes integration", () => {
  let app: FastifyInstance;
  let cliSessionRunner: CliSessionRunner;

  beforeEach(async () => {
    cliSessionRunner = {
      supportsImportedSession(provider) {
        return provider === "codex";
      },
      async resumeSession(input) {
        return {
          text: `CLI resumed: ${input.prompt}`,
          externalSessionId: input.externalSessionId
        };
      }
    };

    app = await createApp({
      db: createInMemoryDatabase(),
      cliSessionRunner,
      jwtSecret: "integration-secret",
      logger: false
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns runtime mode and capabilities for relaydesk and imported sessions", async () => {
    const authHeader = await registerAndAuthenticate(app);
    const projectId = await createProject(app, authHeader);
    const parsedProjectId = new ObjectId(projectId);

    const seededSessions = [
      {
        _id: new ObjectId(),
        projectId: parsedProjectId,
        provider: "mock" as const,
        title: "RelayDesk 会话",
        origin: "relaydesk" as const,
        status: "idle" as const,
        createdAt: new Date("2026-04-05T10:00:00.000Z"),
        updatedAt: new Date("2026-04-05T10:00:00.000Z")
      },
      {
        _id: new ObjectId(),
        projectId: parsedProjectId,
        provider: "codex" as const,
        title: "Imported Codex 会话",
        origin: "imported_cli" as const,
        externalSessionId: "codex-imported-session",
        status: "idle" as const,
        createdAt: new Date("2026-04-05T11:00:00.000Z"),
        updatedAt: new Date("2026-04-05T12:00:00.000Z")
      },
      {
        _id: new ObjectId(),
        projectId: parsedProjectId,
        provider: "cursor" as const,
        title: "Imported Cursor 会话",
        origin: "imported_cli" as const,
        externalSessionId: "cursor-imported-session",
        status: "idle" as const,
        createdAt: new Date("2026-04-05T11:30:00.000Z"),
        updatedAt: new Date("2026-04-05T11:30:00.000Z")
      }
    ];

    for (const session of seededSessions) {
      await app.db.collections.sessions.insertOne(session);
    }

    const response = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/sessions`,
      headers: authHeader
    });
    const body = response.json() as { sessions: SessionRecord[] };

    expect(response.statusCode).toBe(200);
    expect(body.sessions).toHaveLength(3);
    expect(body.sessions.map((session) => session.title)).toEqual([
      "Imported Codex 会话",
      "Imported Cursor 会话",
      "RelayDesk 会话"
    ]);

    body.sessions.forEach((session) => {
      expect(session.id).toHaveLength(24);
      expect(session.projectId).toBe(projectId);
      expect(typeof session.runtimeMode).toBe("string");
      expect(typeof session.capabilities?.canSendMessages).toBe("boolean");
      expect(typeof session.capabilities?.canResume).toBe("boolean");
      expect(typeof session.capabilities?.canStartRuns).toBe("boolean");
      expect(typeof session.capabilities?.canAttachTerminal).toBe("boolean");
    });

    const relaydeskSession = body.sessions.find((session) => session.title === "RelayDesk 会话");
    const importedCodexSession = body.sessions.find((session) => session.title === "Imported Codex 会话");
    const importedCursorSession = body.sessions.find((session) => session.title === "Imported Cursor 会话");

    expect(relaydeskSession).toEqual(
      expect.objectContaining({
        runtimeMode: "api_mode",
        capabilities: {
          canSendMessages: true,
          canResume: false,
          canStartRuns: true,
          canAttachTerminal: true
        }
      })
    );
    expect(importedCodexSession).toEqual(
      expect.objectContaining({
        runtimeMode: "cli_session_mode",
        capabilities: {
          canSendMessages: true,
          canResume: true,
          canStartRuns: true,
          canAttachTerminal: true
        }
      })
    );
    expect(importedCursorSession).toEqual(
      expect.objectContaining({
        runtimeMode: "cli_session_mode",
        capabilities: {
          canSendMessages: false,
          canResume: false,
          canStartRuns: false,
          canAttachTerminal: true
        }
      })
    );
  });

  it("returns a stable message contract when creating user messages", async () => {
    const authHeader = await registerAndAuthenticate(app);
    const projectId = await createProject(app, authHeader);

    const sessionResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/sessions`,
      headers: authHeader,
      payload: {
        title: "新会话",
        provider: "mock"
      }
    });
    const createdSessionBody = sessionResponse.json() as { session: SessionRecord };
    const sessionId = createdSessionBody.session.id;

    expect(sessionResponse.statusCode).toBe(200);
    expect(createdSessionBody.session).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        projectId,
        title: "新会话",
        provider: "mock",
        origin: "relaydesk",
        runtimeMode: "api_mode",
        capabilities: {
          canSendMessages: true,
          canResume: false,
          canStartRuns: true,
          canAttachTerminal: true
        },
        status: "idle"
      })
    );

    const sendMessageResponse = await app.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/messages`,
      headers: authHeader,
      payload: {
        content: "请继续重构"
      }
    });
    const sendMessageBody = sendMessageResponse.json() as {
      message: {
        id: string;
        sessionId: string;
        projectId: string;
        role: string;
        senderType: string;
        content: string;
        status: string;
      };
    };

    expect(sendMessageResponse.statusCode).toBe(200);
    expect(sendMessageBody.message).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        sessionId,
        projectId,
        role: "human",
        senderType: "user",
        content: "请继续重构",
        status: "completed"
      })
    );

    const listMessagesResponse = await app.inject({
      method: "GET",
      url: `/api/sessions/${sessionId}/messages`,
      headers: authHeader
    });
    const listMessagesBody = listMessagesResponse.json() as {
      messages: Array<{
        id: string;
        sessionId: string;
        projectId: string;
        role: string;
        senderType: string;
        content: string;
        status: string;
      }>;
    };

    expect(listMessagesResponse.statusCode).toBe(200);
    expect(listMessagesBody.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: expect.any(String),
          sessionId,
          projectId,
          role: "human",
          senderType: "user",
          content: "请继续重构",
          status: "completed"
        })
      ])
    );
  });

  it("returns stable 400 contracts for invalid session route identifiers and payloads", async () => {
    const authHeader = await registerAndAuthenticate(app);
    const projectId = await createProject(app, authHeader);

    const listInvalidProjectResponse = await app.inject({
      method: "GET",
      url: "/api/projects/not-an-object-id/sessions",
      headers: authHeader
    });
    expect(listInvalidProjectResponse.statusCode).toBe(400);
    expect(listInvalidProjectResponse.json()).toEqual({
      message: "Invalid project id"
    });

    const createInvalidPayloadResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/sessions`,
      headers: authHeader,
      payload: {
        title: "",
        provider: "mock"
      }
    });
    expect(createInvalidPayloadResponse.statusCode).toBe(400);
    expect(createInvalidPayloadResponse.json()).toEqual({
      message: "Invalid payload"
    });

    const listInvalidSessionResponse = await app.inject({
      method: "GET",
      url: "/api/sessions/not-an-object-id/messages",
      headers: authHeader
    });
    expect(listInvalidSessionResponse.statusCode).toBe(400);
    expect(listInvalidSessionResponse.json()).toEqual({
      message: "Invalid session id"
    });
  });

  it("returns stable 404 contracts when session or owning project cannot be resolved", async () => {
    const authHeader = await registerAndAuthenticate(app);
    const unknownSessionId = new ObjectId().toHexString();

    const listMissingSessionResponse = await app.inject({
      method: "GET",
      url: `/api/sessions/${unknownSessionId}/messages`,
      headers: authHeader
    });
    expect(listMissingSessionResponse.statusCode).toBe(404);
    expect(listMissingSessionResponse.json()).toEqual({
      message: "Session not found"
    });

    const orphanedSessionId = new ObjectId();
    await app.db.collections.sessions.insertOne({
      _id: orphanedSessionId,
      projectId: new ObjectId(),
      provider: "mock",
      title: "orphaned session",
      origin: "relaydesk",
      status: "idle",
      createdAt: new Date("2026-04-05T13:00:00.000Z"),
      updatedAt: new Date("2026-04-05T13:00:00.000Z")
    });

    const listOrphanedSessionResponse = await app.inject({
      method: "GET",
      url: `/api/sessions/${orphanedSessionId.toHexString()}/messages`,
      headers: authHeader
    });
    expect(listOrphanedSessionResponse.statusCode).toBe(404);
    expect(listOrphanedSessionResponse.json()).toEqual({
      message: "Project not found"
    });
  });

  it("returns 409 with a stable message for unsupported imported cli continuation", async () => {
    const authHeader = await registerAndAuthenticate(app);
    const projectId = await createProject(app, authHeader);
    const parsedProjectId = new ObjectId(projectId);
    const importedCursorSessionId = new ObjectId();

    await app.db.collections.sessions.insertOne({
      _id: importedCursorSessionId,
      projectId: parsedProjectId,
      provider: "cursor",
      title: "Imported Cursor 会话",
      origin: "imported_cli",
      externalSessionId: "cursor-session",
      status: "idle",
      createdAt: new Date("2026-04-05T14:00:00.000Z"),
      updatedAt: new Date("2026-04-05T14:00:00.000Z")
    });

    const continueResponse = await app.inject({
      method: "POST",
      url: `/api/sessions/${importedCursorSessionId.toHexString()}/messages`,
      headers: authHeader,
      payload: {
        content: "continue"
      }
    });

    expect(continueResponse.statusCode).toBe(409);
    expect(continueResponse.json()).toEqual({
      message: "Imported cursor sessions cannot continue via local CLI yet"
    });
  });
});

async function registerAndAuthenticate(app: FastifyInstance): Promise<{ authorization: string }> {
  const registerResponse = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email: "sessions@example.com",
      password: "password123"
    }
  });

  const registerBody = registerResponse.json() as { token: string };
  return { authorization: `Bearer ${registerBody.token}` };
}

async function createProject(
  app: FastifyInstance,
  authHeader: { authorization: string }
): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/projects",
    headers: authHeader,
    payload: {
      name: "demo-project",
      rootPath: "/Users/test/demo-project"
    }
  });
  const body = response.json() as { project: { id: string } };
  return body.project.id;
}
