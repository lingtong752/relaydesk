import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { ObjectId } from "mongodb";
import { createApp } from "../app.js";
import type { CliSessionRunner } from "../services/cliSessionRunner.js";
import { streamSurrogateRun } from "../services/mockStreams.js";
import { createInMemoryDatabase } from "../testUtils/inMemoryDatabase.js";

vi.mock("../services/mockStreams.js", async () => {
  const actual = await vi.importActual<typeof import("../services/mockStreams.js")>(
    "../services/mockStreams.js"
  );

  return {
    ...actual,
    streamSurrogateRun: vi.fn(async () => undefined)
  };
});

describe("run routes integration", () => {
  let app: FastifyInstance;
  let cliSessionRunner: CliSessionRunner;

  beforeEach(async () => {
    cliSessionRunner = {
      supportsImportedSession(provider) {
        return provider === "claude" || provider === "codex" || provider === "gemini";
      },
      async resumeSession(input) {
        return {
          text: `surrogate via cli: ${input.prompt}`,
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
  });

  afterEach(async () => {
    await app.close();
  });

  it("runs through approval, takeover, resume, reject, and history APIs", async () => {
    const registerResponse = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "integration@example.com",
        password: "password123"
      }
    });
    const registerBody = registerResponse.json() as { token: string };
    const authHeader = { authorization: `Bearer ${registerBody.token}` };

    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: authHeader,
      payload: {
        name: "Integration Demo",
        rootPath: "/workspace/demo"
      }
    });
    const projectBody = projectResponse.json() as { project: { id: string } };

    const sessionResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectBody.project.id}/sessions`,
      headers: authHeader,
      payload: {
        title: "Run Session",
        provider: "mock"
      }
    });
    const sessionBody = sessionResponse.json() as { session: { id: string } };

    const createRunResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectBody.project.id}/runs`,
      headers: authHeader,
      payload: {
        sessionId: sessionBody.session.id,
        objective: "推进当前任务",
        constraints: "保持保守推进"
      }
    });
    expect(createRunResponse.statusCode).toBe(200);
    const createRunBody = createRunResponse.json() as {
      run: { id: string; status: string };
      approval: { id: string };
    };
    expect(createRunBody.run.status).toBe("waiting_human");

    const bootstrapResponse = await app.inject({
      method: "GET",
      url: `/api/projects/${projectBody.project.id}/bootstrap`,
      headers: authHeader
    });
    const bootstrapBody = bootstrapResponse.json() as {
      activeRun: { id: string; status: string } | null;
      latestRun: { id: string; status: string } | null;
      pendingApprovals: Array<{ id: string }>;
    };
    expect(bootstrapBody.activeRun?.id).toBe(createRunBody.run.id);
    expect(bootstrapBody.latestRun?.id).toBe(createRunBody.run.id);
    expect(bootstrapBody.pendingApprovals).toHaveLength(1);

    const approveResponse = await app.inject({
      method: "POST",
      url: `/api/approvals/${createRunBody.approval.id}/approve`,
      headers: authHeader,
      payload: { note: "可以继续" }
    });
    expect(approveResponse.statusCode).toBe(200);
    const approveBody = approveResponse.json() as {
      run: { id: string; status: string } | null;
    };
    expect(approveBody.run?.status).toBe("running");

    const takeoverResponse = await app.inject({
      method: "POST",
      url: `/api/runs/${createRunBody.run.id}/takeover`,
      headers: authHeader
    });
    expect(takeoverResponse.statusCode).toBe(200);
    const takeoverBody = takeoverResponse.json() as {
      run: { status: string } | null;
    };
    expect(takeoverBody.run?.status).toBe("paused");

    const resumeResponse = await app.inject({
      method: "POST",
      url: `/api/runs/${createRunBody.run.id}/resume`,
      headers: authHeader
    });
    expect(resumeResponse.statusCode).toBe(200);
    const resumeBody = resumeResponse.json() as {
      run: { status: string } | null;
      approval: { id: string } | null;
    };
    expect(resumeBody.run?.status).toBe("waiting_human");
    expect(resumeBody.approval?.id).toBeTruthy();

    const rejectResponse = await app.inject({
      method: "POST",
      url: `/api/approvals/${resumeBody.approval!.id}/reject`,
      headers: authHeader,
      payload: { note: "先暂停" }
    });
    expect(rejectResponse.statusCode).toBe(200);
    const rejectBody = rejectResponse.json() as {
      run: { status: string } | null;
    };
    expect(rejectBody.run?.status).toBe("stopped");

    const rejectedBootstrapResponse = await app.inject({
      method: "GET",
      url: `/api/projects/${projectBody.project.id}/bootstrap`,
      headers: authHeader
    });
    expect(rejectedBootstrapResponse.statusCode).toBe(200);
    const rejectedBootstrapBody = rejectedBootstrapResponse.json() as {
      activeRun: { id: string; status: string } | null;
      latestRun: { id: string; status: string } | null;
    };
    expect(rejectedBootstrapBody.activeRun).toBeNull();
    expect(rejectedBootstrapBody.latestRun).toEqual(
      expect.objectContaining({
        id: createRunBody.run.id,
        status: "stopped"
      })
    );

    const auditResponse = await app.inject({
      method: "GET",
      url: `/api/runs/${createRunBody.run.id}/audit-events?limit=10`,
      headers: authHeader
    });
    expect(auditResponse.statusCode).toBe(200);
    const auditBody = auditResponse.json() as {
      events: Array<{ eventType: string }>;
    };
    const eventTypes = auditBody.events.map((event) => event.eventType);
    expect(eventTypes).toHaveLength(5);
    expect(eventTypes).toEqual(
      expect.arrayContaining([
        "run.created",
        "approval.approved",
        "run.taken_over",
        "run.resume_requested",
        "approval.rejected"
      ])
    );

    const checkpointsResponse = await app.inject({
      method: "GET",
      url: `/api/runs/${createRunBody.run.id}/checkpoints?limit=10`,
      headers: authHeader
    });
    expect(checkpointsResponse.statusCode).toBe(200);
    const checkpointsBody = checkpointsResponse.json() as {
      checkpoints: Array<{ id: string; runStatus: string; source: string }>;
    };
    const checkpointStatuses = checkpointsBody.checkpoints.map((checkpoint) => checkpoint.runStatus);
    expect(checkpointStatuses).toHaveLength(5);
    expect(checkpointStatuses).toEqual(
      expect.arrayContaining(["waiting_human", "running", "paused", "stopped"])
    );
    expect(checkpointStatuses.filter((status) => status === "waiting_human")).toHaveLength(2);

    const pausedCheckpoint = checkpointsBody.checkpoints.find((checkpoint) => checkpoint.runStatus === "paused");
    expect(pausedCheckpoint?.source).toBe("run.taken_over");

    const restoreResponse = await app.inject({
      method: "POST",
      url: `/api/runs/${createRunBody.run.id}/restore`,
      headers: authHeader,
      payload: { checkpointId: pausedCheckpoint?.id }
    });
    expect(restoreResponse.statusCode).toBe(200);
    const restoreBody = restoreResponse.json() as {
      run: { status: string } | null;
      approval: { id: string } | null;
      checkpoint: { id: string } | null;
    };
    expect(restoreBody.run?.status).toBe("waiting_human");
    expect(restoreBody.approval?.id).toBeTruthy();
    expect(restoreBody.checkpoint?.id).toBe(pausedCheckpoint?.id);

    const restoredAuditResponse = await app.inject({
      method: "GET",
      url: `/api/runs/${createRunBody.run.id}/audit-events?limit=10`,
      headers: authHeader
    });
    expect(restoredAuditResponse.statusCode).toBe(200);
    const restoredAuditBody = restoredAuditResponse.json() as {
      events: Array<{ eventType: string }>;
    };
    const restoredEventTypes = restoredAuditBody.events.map((event) => event.eventType);
    expect(restoredEventTypes).toHaveLength(6);
    expect(restoredEventTypes).toEqual(expect.arrayContaining(["run.restored"]));

    const restoredCheckpointsResponse = await app.inject({
      method: "GET",
      url: `/api/runs/${createRunBody.run.id}/checkpoints?limit=10`,
      headers: authHeader
    });
    expect(restoredCheckpointsResponse.statusCode).toBe(200);
    const restoredCheckpointsBody = restoredCheckpointsResponse.json() as {
      checkpoints: Array<{ runStatus: string; source: string }>;
    };
    const restoredCheckpointStatuses = restoredCheckpointsBody.checkpoints.map(
      (checkpoint) => checkpoint.runStatus
    );
    expect(restoredCheckpointStatuses).toHaveLength(6);
    expect(restoredCheckpointStatuses.filter((status) => status === "waiting_human")).toHaveLength(3);
    expect(restoredCheckpointsBody.checkpoints[0]?.source).toBe("run.restored");
  });

  it("allows imported Claude and Gemini CLI sessions to start surrogate runs", async () => {
    const registerResponse = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "imported-run@example.com",
        password: "password123"
      }
    });
    const registerBody = registerResponse.json() as { token: string; user: { id: string } };
    const authHeader = { authorization: `Bearer ${registerBody.token}` };

    const projectId = new ObjectId();
    await app.db.collections.projects.insertOne({
      _id: projectId,
      ownerId: new ObjectId(registerBody.user.id),
      name: "Imported CLI Demo",
      rootPath: "/workspace/imported-demo",
      providerPreferences: ["claude"],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const importedClaudeSessionId = new ObjectId();
    await app.db.collections.sessions.insertOne({
      _id: importedClaudeSessionId,
      projectId,
      provider: "claude",
      title: "Imported Claude Session",
      origin: "imported_cli",
      externalSessionId: "claude-imported-session",
      sourcePath: "/tmp/claude-imported.jsonl",
      status: "idle",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const createRunResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId.toHexString()}/runs`,
      headers: authHeader,
      payload: {
        sessionId: importedClaudeSessionId.toHexString(),
        objective: "继续当前 Claude 历史任务",
        constraints: "保守推进"
      }
    });
    expect(createRunResponse.statusCode).toBe(200);
    const createRunBody = createRunResponse.json() as {
      run: { id: string; status: string };
      approval: { id: string };
    };
    expect(createRunBody.run.status).toBe("waiting_human");

    const approveResponse = await app.inject({
      method: "POST",
      url: `/api/approvals/${createRunBody.approval.id}/approve`,
      headers: authHeader,
      payload: {}
    });
    expect(approveResponse.statusCode).toBe(200);
    expect(vi.mocked(streamSurrogateRun)).toHaveBeenCalledWith(
      expect.objectContaining({
        cliSessionRunner,
        run: expect.objectContaining({
          _id: expect.any(ObjectId),
          sessionId: importedClaudeSessionId
        })
      })
    );

    const importedGeminiProjectId = new ObjectId();
    await app.db.collections.projects.insertOne({
      _id: importedGeminiProjectId,
      ownerId: new ObjectId(registerBody.user.id),
      name: "Imported Gemini Demo",
      rootPath: "/workspace/imported-gemini",
      providerPreferences: ["gemini"],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const importedGeminiSessionId = new ObjectId();
    await app.db.collections.sessions.insertOne({
      _id: importedGeminiSessionId,
      projectId: importedGeminiProjectId,
      provider: "gemini",
      title: "Imported Gemini Session",
      origin: "imported_cli",
      externalSessionId: "gemini-imported-session",
      sourcePath: "/tmp/gemini-imported.json",
      status: "idle",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const importedGeminiRunResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${importedGeminiProjectId.toHexString()}/runs`,
      headers: authHeader,
      payload: {
        sessionId: importedGeminiSessionId.toHexString(),
        objective: "继续当前 Gemini 历史任务",
        constraints: "保守推进"
      }
    });
    expect(importedGeminiRunResponse.statusCode).toBe(200);
    const importedGeminiRunBody = importedGeminiRunResponse.json() as {
      run: { id: string; status: string };
      approval: { id: string };
    };
    expect(importedGeminiRunBody.run.status).toBe("waiting_human");

    const approveGeminiResponse = await app.inject({
      method: "POST",
      url: `/api/approvals/${importedGeminiRunBody.approval.id}/approve`,
      headers: authHeader,
      payload: {}
    });
    expect(approveGeminiResponse.statusCode).toBe(200);
    expect(vi.mocked(streamSurrogateRun)).toHaveBeenCalledWith(
      expect.objectContaining({
        cliSessionRunner,
        run: expect.objectContaining({
          _id: expect.any(ObjectId),
          sessionId: importedGeminiSessionId,
          provider: "gemini"
        })
      })
    );
  });
});
