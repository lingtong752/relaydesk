import { beforeEach, describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { SessionHub } from "../ws/sessionHub.js";
import { StreamRegistry, streamSurrogateRun } from "./mockStreams.js";
import type { CliSessionRunner } from "./cliSessionRunner.js";
import { createInMemoryDatabase } from "../testUtils/inMemoryDatabase.js";

describe("streamSurrogateRun imported CLI sessions", () => {
  const now = new Date("2026-03-28T12:00:00.000Z");
  let cliSessionRunner: CliSessionRunner;

  beforeEach(() => {
    cliSessionRunner = {
      supportsImportedSession(provider) {
        return provider === "claude" || provider === "codex" || provider === "gemini";
      },
      async resumeSession(input) {
        return {
          text: `CLI surrogate executed: ${input.prompt}`,
          externalSessionId: `${input.externalSessionId}-next`
        };
      }
    };
  });

  it("uses the local CLI runner for imported sessions and completes the run", async () => {
    const db = createInMemoryDatabase();
    const projectId = new ObjectId();
    const sessionId = new ObjectId();
    const runId = new ObjectId();
    const ownerId = new ObjectId();

    await db.collections.projects.insertOne({
      _id: projectId,
      ownerId,
      name: "Imported Run Project",
      rootPath: "/workspace/imported-run",
      providerPreferences: ["claude"],
      createdAt: now,
      updatedAt: now
    });
    await db.collections.sessions.insertOne({
      _id: sessionId,
      projectId,
      provider: "claude",
      title: "Imported Claude Session",
      origin: "imported_cli",
      externalSessionId: "claude-session",
      sourcePath: "/tmp/claude-session.jsonl",
      status: "idle",
      createdAt: now,
      updatedAt: now
    });
    await db.collections.runs.insertOne({
      _id: runId,
      projectId,
      sessionId,
      provider: "claude",
      objective: "继续处理登录问题",
      constraints: "保守推进",
      status: "running",
      startedAt: now,
      updatedAt: now
    });

    await streamSurrogateRun({
      cliSessionRunner,
      collections: db.collections,
      hub: new SessionHub(),
      registry: new StreamRegistry(),
      run: {
        _id: runId,
        projectId,
        sessionId,
        provider: "claude",
        objective: "继续处理登录问题",
        constraints: "保守推进",
        status: "running",
        startedAt: now,
        updatedAt: now
      }
    });

    const messages = await db.collections.messages.find({ sessionId }).sort({ createdAt: 1 }).toArray();
    const updatedRun = await db.collections.runs.findOne({ _id: runId });
    const updatedSession = await db.collections.sessions.findOne({ _id: sessionId });

    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("surrogate");
    expect(messages[1]?.role).toBe("provider");
    expect(messages[1]?.content).toContain("CLI surrogate executed");
    expect(updatedRun?.status).toBe("completed");
    expect(updatedSession?.externalSessionId).toBe("claude-session-next");
  });
});
