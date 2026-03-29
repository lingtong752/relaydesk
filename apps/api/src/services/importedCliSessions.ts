import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import type {
  DiscoveredProjectRecord,
  MessageRecord,
  MessageRole,
  ProviderId
} from "@shared";
import { ObjectId } from "mongodb";
import type { DatabaseCollections, SessionDoc } from "../db.js";

interface ImportedCliMessageInput {
  role: MessageRole;
  senderType: MessageRecord["senderType"];
  content: string;
  createdAt: string;
}

function normalizePath(value: string): string {
  return path.resolve(value.trim());
}

function normalizeComparablePath(value: string): string {
  return normalizePath(value).toLowerCase();
}

function parseTimestamp(value: unknown): string | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }

  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

function joinTextFragments(fragments: string[]): string {
  return fragments.reduce((result, fragment) => {
    if (!fragment) {
      return result;
    }

    if (!result) {
      return fragment;
    }

    if (result.endsWith("\n") || fragment.startsWith("\n")) {
      return `${result}${fragment}`;
    }

    return `${result}\n\n${fragment}`;
  }, "");
}

function extractText(value: unknown): string {
  if (typeof value === "string") {
    return normalizeLineEndings(value);
  }

  if (Array.isArray(value)) {
    return joinTextFragments(value.map((item) => extractText(item)).filter(Boolean));
  }

  if (typeof value === "object" && value !== null) {
    if ("text" in value && typeof value.text === "string") {
      return normalizeLineEndings(value.text);
    }

    if ("content" in value) {
      return extractText(value.content);
    }

    if ("parts" in value) {
      return extractText(value.parts);
    }

    if ("message" in value) {
      return extractText(value.message);
    }
  }

  return "";
}

function trimSurroundingBlankLines(value: string): string {
  return value.replace(/^(?:[ \t]*\n)+/, "").replace(/(?:\n[ \t]*)+$/, "");
}

function normalizeImportedMessageContent(value: string): string {
  const withoutTrailingWhitespace = normalizeLineEndings(value)
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");

  return trimSurroundingBlankLines(withoutTrailingWhitespace).replace(/\n{3,}/g, "\n\n");
}

function buildComparableMessageContent(value: string): string {
  return normalizeImportedMessageContent(value).replace(/\s+/g, " ").trim();
}

function looksLikeSystemText(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return (
    normalized.startsWith("<command-") ||
    normalized.startsWith("<local-command-") ||
    normalized.startsWith("<system-reminder>") ||
    normalized.startsWith("caveat:") ||
    normalized.startsWith("warmup")
  );
}

function buildImportedSessionKey(provider: ProviderId, externalSessionId: string, sourcePath: string): string {
  return [provider, externalSessionId.trim(), normalizeComparablePath(sourcePath)].join(":");
}

function buildImportedSessionTitle(summary: string, provider: ProviderId): string {
  const normalized = summary.replace(/\s+/g, " ").trim();
  return normalized || `${provider} 历史会话`;
}

function makeSyntheticMessageId(sessionId: string, index: number, role: MessageRole, content: string): string {
  return createHash("sha1")
    .update([sessionId, index.toString(), role, content].join(":"))
    .digest("hex")
    .slice(0, 24);
}

function normalizeMessage(
  current: ImportedCliMessageInput[],
  nextMessage: ImportedCliMessageInput | null
): ImportedCliMessageInput[] {
  if (!nextMessage) {
    return current;
  }

  const normalizedContent = normalizeImportedMessageContent(nextMessage.content);
  const comparableContent = buildComparableMessageContent(normalizedContent);
  if (!comparableContent || looksLikeSystemText(normalizedContent)) {
    return current;
  }

  const previous = current[current.length - 1];
  if (
    previous &&
    previous.role === nextMessage.role &&
    buildComparableMessageContent(previous.content) === comparableContent
  ) {
    return current;
  }

  return [
    ...current,
    {
      ...nextMessage,
      content: normalizedContent
    }
  ];
}

async function parseClaudeMessages(session: SessionDoc, fallbackUpdatedAt: string): Promise<ImportedCliMessageInput[]> {
  if (!session.sourcePath) {
    return [];
  }

  const stream = createReadStream(session.sourcePath, { encoding: "utf8" });
  const reader = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  });
  let messages: ImportedCliMessageInput[] = [];

  try {
    for await (const line of reader) {
      if (!line.trim()) {
        continue;
      }

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }

      const message = asRecord(parsed.message);
      const role = message?.role;
      const content = extractText(message?.content);
      const createdAt =
        parseTimestamp(parsed.timestamp) ??
        parseTimestamp(parsed.updatedAt) ??
        parseTimestamp(parsed.createdAt) ??
        fallbackUpdatedAt;

      if (role === "user") {
        messages = normalizeMessage(messages, {
          role: "human",
          senderType: "user",
          content,
          createdAt
        });
        continue;
      }

      if (role === "assistant") {
        messages = normalizeMessage(messages, {
          role: "provider",
          senderType: "provider",
          content,
          createdAt
        });
      }
    }
  } finally {
    reader.close();
    stream.destroy();
  }

  return messages;
}

async function parseCodexMessages(session: SessionDoc, fallbackUpdatedAt: string): Promise<ImportedCliMessageInput[]> {
  if (!session.sourcePath) {
    return [];
  }

  const stream = createReadStream(session.sourcePath, { encoding: "utf8" });
  const reader = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  });
  let messages: ImportedCliMessageInput[] = [];

  try {
    for await (const line of reader) {
      if (!line.trim()) {
        continue;
      }

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }

      const createdAt =
        parseTimestamp(parsed.timestamp) ??
        parseTimestamp(parsed.updatedAt) ??
        parseTimestamp(parsed.createdAt) ??
        fallbackUpdatedAt;

      if (parsed.type === "event_msg") {
        const payload = asRecord(parsed.payload);
        if (payload?.type === "user_message" && typeof payload.message === "string") {
          messages = normalizeMessage(messages, {
            role: "human",
            senderType: "user",
            content: payload.message.trim(),
            createdAt
          });
        }
        continue;
      }

      if (parsed.type !== "response_item") {
        continue;
      }

      const payload = asRecord(parsed.payload);
      if (payload?.type !== "message") {
        continue;
      }

      const content = extractText(payload.content);
      if (payload.role === "user") {
        messages = normalizeMessage(messages, {
          role: "human",
          senderType: "user",
          content,
          createdAt
        });
        continue;
      }

      if (payload.role === "assistant") {
        messages = normalizeMessage(messages, {
          role: "provider",
          senderType: "provider",
          content,
          createdAt
        });
      }
    }
  } finally {
    reader.close();
    stream.destroy();
  }

  return messages;
}

async function parseGeminiMessages(session: SessionDoc, fallbackUpdatedAt: string): Promise<ImportedCliMessageInput[]> {
  if (!session.sourcePath) {
    return [];
  }

  try {
    const content = await readFile(session.sourcePath, "utf8");
    const parsed = JSON.parse(content) as
      | {
      lastUpdated?: string;
      startTime?: string;
      messages?: Array<{
        type?: string;
        role?: string;
        timestamp?: string;
        createdAt?: string;
        content?: unknown;
      }>;
    }
      | unknown[];

    if (Array.isArray(parsed)) {
      let messages: ImportedCliMessageInput[] = [];
      const fallbackSessionId =
        session.externalSessionId?.trim() || path.basename(session.sourcePath, ".json");

      for (const rawEntry of parsed) {
        const entry = asRecord(rawEntry);
        if (!entry) {
          continue;
        }

        const sessionId =
          getString(entry.sessionId) ??
          getString(entry.session_id) ??
          getString(entry.chatId) ??
          getString(entry.chat_id) ??
          fallbackSessionId;
        if (sessionId !== fallbackSessionId) {
          continue;
        }

        const roleCandidate = (
          getString(entry.role) ??
          getString(asRecord(entry.message)?.role) ??
          getString(asRecord(entry.payload)?.role) ??
          getString(entry.type) ??
          getString(asRecord(entry.payload)?.type) ??
          ""
        ).toLowerCase();
        const text =
          extractText(entry.content) ||
          extractText(entry.message) ||
          extractText(entry.response) ||
          extractText(entry.prompt) ||
          extractText(asRecord(entry.payload)?.content) ||
          extractText(asRecord(entry.payload)?.message) ||
          extractText(asRecord(entry.payload)?.response);
        if (!text || looksLikeSystemText(text)) {
          continue;
        }

        const createdAt =
          parseTimestamp(entry.timestamp) ??
          parseTimestamp(entry.updatedAt) ??
          parseTimestamp(entry.createdAt) ??
          fallbackUpdatedAt;

        if (roleCandidate === "user" || roleCandidate === "human" || roleCandidate.includes("user")) {
          messages = normalizeMessage(messages, {
            role: "human",
            senderType: "user",
            content: text,
            createdAt
          });
          continue;
        }

        if (
          roleCandidate === "model" ||
          roleCandidate === "assistant" ||
          roleCandidate.includes("model") ||
          roleCandidate.includes("assistant") ||
          roleCandidate.includes("response")
        ) {
          messages = normalizeMessage(messages, {
            role: "provider",
            senderType: "provider",
            content: text,
            createdAt
          });
        }
      }

      return messages;
    }

    const defaultCreatedAt =
      parseTimestamp(parsed.lastUpdated) ??
      parseTimestamp(parsed.startTime) ??
      fallbackUpdatedAt;

    let messages: ImportedCliMessageInput[] = [];
    for (const message of parsed.messages ?? []) {
      const role = message.type ?? message.role;
      const createdAt =
        parseTimestamp(message.timestamp) ??
        parseTimestamp(message.createdAt) ??
        defaultCreatedAt;
      const text = extractText(message.content);

      if (role === "user") {
        messages = normalizeMessage(messages, {
          role: "human",
          senderType: "user",
          content: text,
          createdAt
        });
        continue;
      }

      if (role === "model" || role === "assistant") {
        messages = normalizeMessage(messages, {
          role: "provider",
          senderType: "provider",
          content: text,
          createdAt
        });
      }
    }

    return messages;
  } catch {
    return [];
  }
}

async function parseImportedCliMessages(session: SessionDoc): Promise<ImportedCliMessageInput[]> {
  if (session.origin !== "imported_cli" || !session.sourcePath) {
    return [];
  }

  const fallbackUpdatedAt = (
    await stat(session.sourcePath).catch(() => null)
  )?.mtime.toISOString() ?? session.updatedAt.toISOString();

  if (session.provider === "claude") {
    return parseClaudeMessages(session, fallbackUpdatedAt);
  }

  if (session.provider === "codex") {
    return parseCodexMessages(session, fallbackUpdatedAt);
  }

  if (session.provider === "gemini") {
    return parseGeminiMessages(session, fallbackUpdatedAt);
  }

  return [];
}

export async function syncImportedCliSessions(input: {
  collections: DatabaseCollections;
  projectId: ObjectId;
  discoveredProject: DiscoveredProjectRecord;
}): Promise<void> {
  const existingSessions = await input.collections.sessions.find({ projectId: input.projectId }).toArray();
  const importedSessionIndex = new Map(
    existingSessions
      .filter((session) => session.origin === "imported_cli" && session.externalSessionId && session.sourcePath)
      .map((session) => [
        buildImportedSessionKey(session.provider, session.externalSessionId!, session.sourcePath!),
        session
      ] as const)
  );

  for (const discoveredSession of input.discoveredProject.sessions) {
    const sourcePath = normalizePath(discoveredSession.sourcePath);
    const externalSessionId = discoveredSession.id.trim();
    const comparableKey = buildImportedSessionKey(
      discoveredSession.provider,
      externalSessionId,
      sourcePath
    );
    const existingSession = importedSessionIndex.get(comparableKey);
    const lastActivity = parseTimestamp(discoveredSession.lastActivity);
    const timestamp = lastActivity ? new Date(lastActivity) : new Date();
    const title = buildImportedSessionTitle(discoveredSession.summary, discoveredSession.provider);

    if (existingSession) {
      const shouldUpdateTimestamp = existingSession.updatedAt.getTime() < timestamp.getTime();
      const nextValues: Partial<SessionDoc> = {};

      if (existingSession.title !== title) {
        nextValues.title = title;
      }

      if (shouldUpdateTimestamp) {
        nextValues.updatedAt = timestamp;
        nextValues.lastMessageAt = timestamp;
      }

      if (Object.keys(nextValues).length > 0) {
        await input.collections.sessions.updateOne(
          { _id: existingSession._id },
          { $set: nextValues }
        );
      }

      continue;
    }

    await input.collections.sessions.insertOne({
      projectId: input.projectId,
      provider: discoveredSession.provider,
      title,
      origin: "imported_cli",
      externalSessionId,
      sourcePath,
      status: "idle",
      createdAt: timestamp,
      updatedAt: timestamp,
      lastMessageAt: timestamp
    });
  }
}

export async function loadImportedCliMessages(session: SessionDoc): Promise<MessageRecord[]> {
  const messages = await parseImportedCliMessages(session);

  return messages.map((message, index) => ({
    id: makeSyntheticMessageId(session._id!.toHexString(), index, message.role, message.content),
    sessionId: session._id!.toHexString(),
    projectId: session.projectId.toHexString(),
    role: message.role,
    senderType: message.senderType,
    provider: session.provider,
    content: message.content,
    status: "completed",
    createdAt: message.createdAt,
    updatedAt: message.createdAt
  }));
}

function compareMessages(left: MessageRecord, right: MessageRecord): number {
  const createdAtDelta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  if (createdAtDelta !== 0) {
    return createdAtDelta;
  }

  return left.id.localeCompare(right.id);
}

function shouldDeduplicateMessage(left: MessageRecord, right: MessageRecord): boolean {
  if (left.role !== right.role || left.senderType !== right.senderType) {
    return false;
  }

  if (left.content.trim() !== right.content.trim()) {
    return false;
  }

  const createdAtDelta = Math.abs(
    new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  );

  return createdAtDelta <= 5 * 60 * 1000;
}

export async function listImportedCliConversationMessages(input: {
  session: SessionDoc;
  overlayMessages: MessageRecord[];
}): Promise<MessageRecord[]> {
  const sourceMessages = await loadImportedCliMessages(input.session);
  const mergedMessages = [...sourceMessages, ...input.overlayMessages].sort(compareMessages);
  const deduplicated: MessageRecord[] = [];

  for (const message of mergedMessages) {
    const previous = deduplicated[deduplicated.length - 1];
    if (previous && shouldDeduplicateMessage(previous, message)) {
      continue;
    }

    deduplicated.push(message);
  }

  return deduplicated;
}

export async function findDiscoveredProjectByRoot(input: {
  homeDir?: string;
  projectRootPath: string;
  discoverLocalProjects: (options?: {
    homeDir?: string;
    knownProjectRoots?: string[];
    sessionPreviewLimit?: number;
    sessionScanLimit?: number;
  }) => Promise<DiscoveredProjectRecord[]>;
}): Promise<DiscoveredProjectRecord | null> {
  const targetRootPath = normalizeComparablePath(input.projectRootPath);
  const discoveredProjects = await input.discoverLocalProjects({
    homeDir: input.homeDir,
    knownProjectRoots: [input.projectRootPath],
    sessionPreviewLimit: Number.POSITIVE_INFINITY,
    sessionScanLimit: Number.POSITIVE_INFINITY
  });
  return (
    discoveredProjects.find(
      (project) => normalizeComparablePath(project.rootPath) === targetRootPath
    ) ?? null
  );
}
