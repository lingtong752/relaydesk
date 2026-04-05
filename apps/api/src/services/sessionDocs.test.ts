import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";
import {
  createRelayDeskSessionDoc,
  createUserMessageDoc,
  getImportedSessionContinuationError,
  resolveSessionStatusAfterUserMessage
} from "./sessionDocs.js";

describe("sessionDocs", () => {
  it("creates relaydesk session docs with api runtime defaults", () => {
    const now = new Date("2026-04-05T10:00:00.000Z");
    const doc = createRelayDeskSessionDoc({
      projectId: new ObjectId("67f0879e8c3f26e3c79c0a11"),
      provider: "codex",
      title: "new session",
      now
    });

    expect(doc).toEqual(
      expect.objectContaining({
        provider: "codex",
        title: "new session",
        origin: "relaydesk",
        runtimeMode: "api_mode",
        status: "idle",
        createdAt: now,
        updatedAt: now
      })
    );
  });

  it("creates user message docs for session conversations", () => {
    const now = new Date("2026-04-05T10:00:00.000Z");
    const sessionId = new ObjectId("67f0879e8c3f26e3c79c0a12");
    const projectId = new ObjectId("67f0879e8c3f26e3c79c0a13");

    const message = createUserMessageDoc({
      sessionId,
      projectId,
      provider: "claude",
      content: "continue",
      now
    });

    expect(message).toEqual(
      expect.objectContaining({
        sessionId,
        projectId,
        role: "human",
        senderType: "user",
        provider: "claude",
        content: "continue",
        status: "completed",
        createdAt: now,
        updatedAt: now
      })
    );
  });

  it("resolves session status transitions and continuation guards", () => {
    expect(resolveSessionStatusAfterUserMessage("relaydesk")).toBe("running");
    expect(resolveSessionStatusAfterUserMessage("imported_cli")).toBe("reconnecting");

    expect(
      getImportedSessionContinuationError({
        origin: "relaydesk",
        provider: "cursor",
        supportsImportedSession: () => false
      })
    ).toBeNull();

    expect(
      getImportedSessionContinuationError({
        origin: "imported_cli",
        provider: "codex",
        supportsImportedSession: () => true
      })
    ).toBeNull();

    expect(
      getImportedSessionContinuationError({
        origin: "imported_cli",
        provider: "cursor",
        supportsImportedSession: () => false
      })
    ).toBe("Imported cursor sessions cannot continue via local CLI yet");
  });
});
