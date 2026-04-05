import type { SessionRecord } from "@shared";
import type { ObjectId } from "mongodb";
import type { MessageDoc, SessionDoc } from "../db.js";

export function createRelayDeskSessionDoc(input: {
  projectId: ObjectId;
  provider: SessionRecord["provider"];
  title: string;
  now: Date;
}): SessionDoc {
  return {
    projectId: input.projectId,
    provider: input.provider,
    title: input.title,
    origin: "relaydesk",
    runtimeMode: "api_mode",
    status: "idle",
    createdAt: input.now,
    updatedAt: input.now
  };
}

export function createUserMessageDoc(input: {
  sessionId: ObjectId;
  projectId: ObjectId;
  provider: SessionRecord["provider"];
  content: string;
  now: Date;
}): MessageDoc {
  return {
    sessionId: input.sessionId,
    projectId: input.projectId,
    role: "human",
    senderType: "user",
    provider: input.provider,
    content: input.content,
    status: "completed",
    createdAt: input.now,
    updatedAt: input.now
  };
}

export function resolveSessionStatusAfterUserMessage(
  origin: SessionRecord["origin"]
): SessionRecord["status"] {
  return origin === "imported_cli" ? "reconnecting" : "running";
}

export function getImportedSessionContinuationError(input: {
  origin: SessionRecord["origin"];
  provider: SessionRecord["provider"];
  supportsImportedSession(provider: SessionRecord["provider"]): boolean;
}): string | null {
  if (input.origin !== "imported_cli") {
    return null;
  }

  if (input.supportsImportedSession(input.provider)) {
    return null;
  }

  return `Imported ${input.provider} sessions cannot continue via local CLI yet`;
}
