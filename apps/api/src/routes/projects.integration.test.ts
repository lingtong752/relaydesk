import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { FastifyInstance } from "fastify";
import { createApp } from "../app.js";
import type { CliSessionRunner } from "../services/cliSessionRunner.js";
import { createInMemoryDatabase } from "../testUtils/inMemoryDatabase.js";

describe("project routes integration", () => {
  let app: FastifyInstance;
  let discoveryHomeDir: string;
  let cliSessionRunner: CliSessionRunner;

  beforeEach(async () => {
    discoveryHomeDir = await mkdtemp(path.join(os.tmpdir(), "relaydesk-discovery-"));
    await seedDiscoveryFixtures(discoveryHomeDir);
    cliSessionRunner = {
      supportsImportedSession(provider) {
        return provider === "claude" || provider === "codex" || provider === "gemini";
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
      discoveryHomeDir,
      jwtSecret: "integration-secret",
      logger: false
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await rm(discoveryHomeDir, { recursive: true, force: true });
  });

  it("discovers local CLI projects and links them to existing RelayDesk projects", async () => {
    const authHeader = await registerAndAuthenticate(app);

    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: authHeader,
      payload: {
        name: "demo",
        rootPath: "/Users/test/demo"
      }
    });
    const projectBody = projectResponse.json() as { project: { id: string; name: string } };

    const discoveryResponse = await app.inject({
      method: "GET",
      url: "/api/projects/discovery",
      headers: authHeader
    });

    expect(discoveryResponse.statusCode).toBe(200);
    const discoveryBody = discoveryResponse.json() as {
      projects: Array<{
        name: string;
        rootPath: string;
        providers: string[];
        sessionCount: number;
        linkedProjectId: string | null;
        linkedProjectName: string | null;
        sessions: Array<{ provider: string; summary: string }>;
      }>;
    };

    expect(discoveryBody.projects).toHaveLength(1);
    expect(discoveryBody.projects[0]).toEqual(
      expect.objectContaining({
        name: "demo",
        rootPath: "/Users/test/demo",
        sessionCount: 3,
        linkedProjectId: projectBody.project.id,
        linkedProjectName: projectBody.project.name
      })
    );
    expect(discoveryBody.projects[0]?.providers).toEqual(["claude", "codex", "gemini"]);
    expect(discoveryBody.projects[0]?.sessions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: "claude", summary: "Fix login page" }),
        expect.objectContaining({ provider: "codex", summary: "Refactor API client" }),
        expect.objectContaining({ provider: "gemini", summary: "Audit websocket reconnect" })
      ])
    );

    const bootstrapResponse = await app.inject({
      method: "GET",
      url: `/api/projects/${projectBody.project.id}/bootstrap`,
      headers: authHeader
    });
    const bootstrapBody = bootstrapResponse.json() as {
      sessions: Array<{
        id: string;
        provider: string;
        origin: string;
        externalSessionId?: string;
        title: string;
      }>;
    };

    expect(bootstrapResponse.statusCode).toBe(200);
    expect(bootstrapBody.sessions).toHaveLength(3);
    expect(bootstrapBody.sessions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "claude",
          origin: "imported_cli",
          externalSessionId: "claude-session",
          title: "Fix login page"
        }),
        expect.objectContaining({
          provider: "codex",
          origin: "imported_cli",
          externalSessionId: "codex-session",
          title: "Refactor API client"
        }),
        expect.objectContaining({
          provider: "gemini",
          origin: "imported_cli",
          externalSessionId: "gemini-session",
          title: "Audit websocket reconnect"
        })
      ])
    );

    const claudeSession = bootstrapBody.sessions.find((session) => session.provider === "claude");
    expect(claudeSession).toBeDefined();

    const messagesResponse = await app.inject({
      method: "GET",
      url: `/api/sessions/${claudeSession!.id}/messages`,
      headers: authHeader
    });
    const messagesBody = messagesResponse.json() as {
      messages: Array<{ role: string; content: string }>;
    };

    expect(messagesResponse.statusCode).toBe(200);
    expect(messagesBody.messages).toEqual([
      expect.objectContaining({ role: "human", content: "Fix login page" }),
      expect.objectContaining({
        role: "provider",
        content: "I traced the auth flow and found a stale redirect guard."
      })
    ]);

    const continueResponse = await app.inject({
      method: "POST",
      url: `/api/sessions/${claudeSession!.id}/messages`,
      headers: authHeader,
      payload: {
        content: "Continue the fix"
      }
    });

    expect(continueResponse.statusCode).toBe(200);
    await waitForAsyncWork();

    const continuedMessagesResponse = await app.inject({
      method: "GET",
      url: `/api/sessions/${claudeSession!.id}/messages`,
      headers: authHeader
    });
    const continuedMessagesBody = continuedMessagesResponse.json() as {
      messages: Array<{ role: string; content: string }>;
    };

    expect(continuedMessagesResponse.statusCode).toBe(200);
    expect(continuedMessagesBody.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "human", content: "Continue the fix" }),
        expect.objectContaining({ role: "provider", content: "CLI resumed: Continue the fix" })
      ])
    );

    const geminiSession = bootstrapBody.sessions.find((session) => session.provider === "gemini");
    expect(geminiSession).toBeDefined();

    const geminiHistoryResponse = await app.inject({
      method: "GET",
      url: `/api/sessions/${geminiSession!.id}/messages`,
      headers: authHeader
    });
    const geminiHistoryBody = geminiHistoryResponse.json() as {
      messages: Array<{ role: string; content: string }>;
    };

    expect(geminiHistoryResponse.statusCode).toBe(200);
    expect(geminiHistoryBody.messages).toEqual([
      expect.objectContaining({ role: "human", content: "Audit websocket reconnect" }),
      expect.objectContaining({
        role: "provider",
        content: "I found one reconnect race around stale subscriptions."
      })
    ]);

    const geminiContinueResponse = await app.inject({
      method: "POST",
      url: `/api/sessions/${geminiSession!.id}/messages`,
      headers: authHeader,
      payload: {
        content: "Continue from Gemini"
      }
    });

    expect(geminiContinueResponse.statusCode).toBe(200);
    await waitForAsyncWork();

    const geminiMessagesResponse = await app.inject({
      method: "GET",
      url: `/api/sessions/${geminiSession!.id}/messages`,
      headers: authHeader
    });
    const geminiMessagesBody = geminiMessagesResponse.json() as {
      messages: Array<{ role: string; content: string }>;
    };

    expect(geminiMessagesResponse.statusCode).toBe(200);
    expect(geminiMessagesBody.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "human", content: "Continue from Gemini" }),
        expect.objectContaining({ role: "provider", content: "CLI resumed: Continue from Gemini" })
      ])
    );

    const runResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectBody.project.id}/runs`,
      headers: authHeader,
      payload: {
        sessionId: claudeSession!.id,
        objective: "continue",
        constraints: ""
      }
    });

    expect(runResponse.statusCode).toBe(200);
    expect(runResponse.json()).toEqual(
      expect.objectContaining({
        run: expect.objectContaining({
          status: "waiting_human",
          provider: "claude"
        }),
        approval: expect.objectContaining({
          status: "pending"
        })
      })
    );
  });

  it("returns an existing project when importing the same root path twice", async () => {
    const authHeader = await registerAndAuthenticate(app);

    const firstResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: authHeader,
      payload: {
        name: "demo",
        rootPath: "/Users/test/demo"
      }
    });
    const firstBody = firstResponse.json() as { project: { id: string } };

    const secondResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: authHeader,
      payload: {
        name: "demo-imported",
        rootPath: "/Users/test/demo"
      }
    });
    const secondBody = secondResponse.json() as { project: { id: string; name: string } };

    expect(secondResponse.statusCode).toBe(200);
    expect(secondBody.project.id).toBe(firstBody.project.id);
    expect(secondBody.project.name).toBe("demo");
  });
});

async function registerAndAuthenticate(app: FastifyInstance): Promise<{ authorization: string }> {
  const registerResponse = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email: "projects@example.com",
      password: "password123"
    }
  });

  const registerBody = registerResponse.json() as { token: string };
  return { authorization: `Bearer ${registerBody.token}` };
}

async function waitForAsyncWork(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function seedDiscoveryFixtures(homeDir: string): Promise<void> {
  const claudeProjectDir = path.join(homeDir, ".claude", "projects", "-Users-test-demo");
  await mkdir(claudeProjectDir, { recursive: true });
  await writeFile(
    path.join(claudeProjectDir, "claude-session.jsonl"),
    [
      JSON.stringify({
        sessionId: "claude-session",
        cwd: "/Users/test/demo",
        timestamp: "2026-03-28T10:00:00.000Z",
        summary: "Fix login page"
      }),
      JSON.stringify({
        sessionId: "claude-session",
        cwd: "/Users/test/demo",
        timestamp: "2026-03-28T10:01:00.000Z",
        message: {
          role: "user",
          content: "Fix login page"
        }
      }),
      JSON.stringify({
        sessionId: "claude-session",
        cwd: "/Users/test/demo",
        timestamp: "2026-03-28T10:02:00.000Z",
        message: {
          role: "assistant",
          content: "I traced the auth flow and found a stale redirect guard."
        }
      })
    ].join("\n"),
    "utf8"
  );

  const codexSessionDir = path.join(homeDir, ".codex", "sessions", "2026", "03", "28");
  await mkdir(codexSessionDir, { recursive: true });
  await writeFile(
    path.join(codexSessionDir, "codex-session.jsonl"),
    [
      JSON.stringify({
        type: "session_meta",
        timestamp: "2026-03-28T11:00:00.000Z",
        payload: {
          id: "codex-session",
          cwd: "/Users/test/demo"
        }
      }),
      JSON.stringify({
        type: "event_msg",
        timestamp: "2026-03-28T11:10:00.000Z",
        payload: {
          type: "user_message",
          message: "Refactor API client"
        }
      }),
      JSON.stringify({
        type: "response_item",
        timestamp: "2026-03-28T11:12:00.000Z",
        payload: {
          type: "message",
          role: "assistant",
          content: "I split the request helpers into provider-specific modules."
        }
      })
    ].join("\n"),
    "utf8"
  );

  const geminiProjectHash = createHash("sha256").update("/Users/test/demo").digest("hex");
  const geminiProjectDir = path.join(homeDir, ".gemini", "tmp", geminiProjectHash);
  await mkdir(geminiProjectDir, { recursive: true });
  await writeFile(
    path.join(geminiProjectDir, "logs.json"),
    JSON.stringify([
      {
        sessionId: "gemini-session",
        type: "user",
        timestamp: "2026-03-28T12:00:00.000Z",
        content: "Audit websocket reconnect"
      },
      {
        sessionId: "gemini-session",
        type: "model",
        timestamp: "2026-03-28T12:01:00.000Z",
        content: "I found one reconnect race around stale subscriptions."
      }
    ]),
    "utf8"
  );
}
