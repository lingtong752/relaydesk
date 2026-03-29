import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import type { DiscoveredProjectRecord, DiscoveredSessionRecord, ProviderId } from "@shared";

const DEFAULT_PROJECT_SESSION_PREVIEW_LIMIT = 5;
const MAX_CODEX_SESSION_FILES = 200;

interface DiscoveryAccumulator {
  rootPath: string;
  name: string;
  providers: Set<ProviderId>;
  sessions: DiscoveredSessionRecord[];
  sessionCount: number;
  lastActivity?: string;
}

interface DiscoverySessionInput {
  provider: ProviderId;
  sessionId: string;
  rootPath: string;
  summary: string;
  sourcePath: string;
  lastActivity?: string;
}

interface GeminiLogEntry {
  sessionId: string;
  role: "human" | "provider" | null;
  content: string;
  createdAt: string;
}

function buildProjectId(rootPath: string): string {
  return createHash("sha1").update(rootPath).digest("hex").slice(0, 12);
}

function buildProjectName(rootPath: string): string {
  const normalized = rootPath.trim();
  return path.basename(normalized) || normalized;
}

function clampSummary(value: string, limit = 96): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "历史会话";
  }

  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}…` : normalized;
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

function extractText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value.map((item) => extractText(item)).filter(Boolean).join(" ").trim();
  }

  if (typeof value === "object" && value !== null) {
    if ("text" in value && typeof value.text === "string") {
      return value.text.trim();
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
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

function shouldReplaceLastActivity(nextValue: string | undefined, currentValue: string | undefined): boolean {
  if (!nextValue) {
    return false;
  }

  if (!currentValue) {
    return true;
  }

  return new Date(nextValue).getTime() > new Date(currentValue).getTime();
}

function addDiscoveredSession(
  projectsByRoot: Map<string, DiscoveryAccumulator>,
  input: DiscoverySessionInput
): void {
  const normalizedRootPath = path.resolve(input.rootPath.trim());
  const project =
    projectsByRoot.get(normalizedRootPath) ??
    (() => {
      const created: DiscoveryAccumulator = {
        rootPath: normalizedRootPath,
        name: buildProjectName(normalizedRootPath),
        providers: new Set<ProviderId>(),
        sessions: [],
        sessionCount: 0
      };
      projectsByRoot.set(normalizedRootPath, created);
      return created;
    })();

  project.providers.add(input.provider);
  if (shouldReplaceLastActivity(input.lastActivity, project.lastActivity)) {
    project.lastActivity = input.lastActivity;
  }

  const existingSession = project.sessions.find(
    (session) => session.provider === input.provider && session.id === input.sessionId
  );

  if (existingSession) {
    if (shouldReplaceLastActivity(input.lastActivity, existingSession.lastActivity)) {
      existingSession.lastActivity = input.lastActivity;
      existingSession.sourcePath = input.sourcePath;
    }

    if (existingSession.summary === "历史会话" || existingSession.summary === buildProjectName(normalizedRootPath)) {
      existingSession.summary = clampSummary(input.summary);
    }

    return;
  }

  project.sessionCount += 1;
  project.sessions.push({
    id: input.sessionId,
    provider: input.provider,
    summary: clampSummary(input.summary),
    sourcePath: input.sourcePath,
    lastActivity: input.lastActivity
  });
}

function buildGeminiProjectHash(rootPath: string): string {
  return createHash("sha256").update(path.resolve(rootPath.trim())).digest("hex");
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getGeminiLogSessionId(entry: Record<string, unknown>, fallback: string): string {
  return (
    getString(entry.sessionId) ??
    getString(entry.session_id) ??
    getString(entry.chatId) ??
    getString(entry.chat_id) ??
    fallback
  );
}

function getGeminiLogRole(entry: Record<string, unknown>): GeminiLogEntry["role"] {
  const directRole = getString(entry.role)?.toLowerCase();
  const directType = getString(entry.type)?.toLowerCase();
  const messageRole = getString(asRecord(entry.message)?.role)?.toLowerCase();
  const payloadRole = getString(asRecord(entry.payload)?.role)?.toLowerCase();
  const payloadType = getString(asRecord(entry.payload)?.type)?.toLowerCase();

  const candidate = directRole ?? messageRole ?? payloadRole ?? directType ?? payloadType;
  if (!candidate) {
    return null;
  }

  if (candidate === "user" || candidate === "human" || candidate.includes("user")) {
    return "human";
  }

  if (
    candidate === "model" ||
    candidate === "assistant" ||
    candidate.includes("model") ||
    candidate.includes("assistant") ||
    candidate.includes("response")
  ) {
    return "provider";
  }

  return null;
}

function extractGeminiLogText(entry: Record<string, unknown>): string {
  return (
    extractText(entry.content) ||
    extractText(entry.message) ||
    extractText(entry.response) ||
    extractText(entry.prompt) ||
    extractText(asRecord(entry.payload)?.content) ||
    extractText(asRecord(entry.payload)?.message) ||
    extractText(asRecord(entry.payload)?.response)
  );
}

function normalizeGeminiLogEntries(
  rawEntries: unknown[],
  fallbackUpdatedAt: string,
  fallbackSessionId: string
): GeminiLogEntry[] {
  const normalized: GeminiLogEntry[] = [];

  for (const entry of rawEntries) {
    const record = asRecord(entry);
    if (!record) {
      continue;
    }

    const role = getGeminiLogRole(record);
    const content = extractGeminiLogText(record);
    if (!role || !content || looksLikeSystemText(content)) {
      continue;
    }

    normalized.push({
      sessionId: getGeminiLogSessionId(record, fallbackSessionId),
      role,
      content,
      createdAt:
        parseTimestamp(record.timestamp) ??
        parseTimestamp(record.updatedAt) ??
        parseTimestamp(record.createdAt) ??
        fallbackUpdatedAt
    });
  }

  return normalized;
}

async function parseGeminiLogSessions(
  rootPath: string,
  filePath: string,
  fallbackUpdatedAt: string
): Promise<DiscoverySessionInput[]> {
  try {
    const content = await readFile(filePath, "utf8");
    const parsed = JSON.parse(content) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    const entries = normalizeGeminiLogEntries(parsed, fallbackUpdatedAt, path.basename(filePath, ".json"));
    const sessions = new Map<string, { summary: string; lastActivity: string }>();

    for (const entry of entries) {
      const current = sessions.get(entry.sessionId);
      const nextSummary =
        current?.summary ||
        (entry.role === "human" ? entry.content : "") ||
        path.basename(rootPath);
      const nextLastActivity = shouldReplaceLastActivity(entry.createdAt, current?.lastActivity)
        ? entry.createdAt
        : current?.lastActivity ?? entry.createdAt;

      sessions.set(entry.sessionId, {
        summary: nextSummary,
        lastActivity: nextLastActivity
      });
    }

    return [...sessions.entries()].map(([sessionId, session]) => ({
      provider: "gemini",
      sessionId,
      rootPath,
      summary: session.summary,
      sourcePath: filePath,
      lastActivity: session.lastActivity
    }));
  } catch {
    return [];
  }
}

async function listRecentFiles(
  directoryPath: string,
  predicate: (fileName: string) => boolean,
  limit: number
): Promise<Array<{ filePath: string; updatedAt: string }>> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && predicate(entry.name))
      .map(async (entry) => {
        const filePath = path.join(directoryPath, entry.name);
        const fileStat = await stat(filePath);
        return {
          filePath,
          updatedAt: fileStat.mtime.toISOString()
        };
      })
  );

  return files
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .slice(0, limit);
}

async function collectFilesRecursively(
  directoryPath: string,
  predicate: (fileName: string) => boolean
): Promise<Array<{ filePath: string; updatedAt: string }>> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const results: Array<{ filePath: string; updatedAt: string }> = [];

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectFilesRecursively(entryPath, predicate)));
      continue;
    }

    if (!entry.isFile() || !predicate(entry.name)) {
      continue;
    }

    const fileStat = await stat(entryPath);
    results.push({
      filePath: entryPath,
      updatedAt: fileStat.mtime.toISOString()
    });
  }

  return results;
}

async function parseClaudeSession(
  filePath: string,
  fallbackRootPath: string,
  fallbackUpdatedAt: string
): Promise<DiscoverySessionInput | null> {
  let sessionId = path.basename(filePath, ".jsonl");
  let rootPath = fallbackRootPath;
  let summary = "";
  let lastActivity = fallbackUpdatedAt;

  const stream = createReadStream(filePath, { encoding: "utf8" });
  const reader = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  });

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

      if (typeof parsed.sessionId === "string" && parsed.sessionId.trim()) {
        sessionId = parsed.sessionId.trim();
      }

      if (typeof parsed.cwd === "string" && parsed.cwd.trim()) {
        rootPath = parsed.cwd.trim();
      }

      const candidateLastActivity =
        parseTimestamp(parsed.timestamp) ??
        parseTimestamp(parsed.updatedAt) ??
        parseTimestamp(parsed.createdAt);
      if (shouldReplaceLastActivity(candidateLastActivity, lastActivity)) {
        lastActivity = candidateLastActivity!;
      }

      if (summary) {
        continue;
      }

      if (typeof parsed.summary === "string" && parsed.summary.trim()) {
        summary = parsed.summary.trim();
        continue;
      }

      const role = typeof parsed.message === "object" && parsed.message !== null && "role" in parsed.message
        ? parsed.message.role
        : undefined;
      if (role !== "user" && role !== "assistant") {
        continue;
      }

      const text =
        typeof parsed.message === "object" && parsed.message !== null && "content" in parsed.message
          ? extractText(parsed.message.content)
          : "";
      if (text && !looksLikeSystemText(text)) {
        summary = text;
      }
    }
  } finally {
    reader.close();
    stream.destroy();
  }

  if (!rootPath.trim()) {
    return null;
  }

  return {
    provider: "claude",
    sessionId,
    rootPath,
    summary: summary || path.basename(rootPath),
    sourcePath: filePath,
    lastActivity
  };
}

async function discoverClaudeProjects(
  homeDir: string,
  projectsByRoot: Map<string, DiscoveryAccumulator>,
  sessionFileLimit: number
): Promise<void> {
  const claudeProjectsPath = path.join(homeDir, ".claude", "projects");

  try {
    const projectDirs = await readdir(claudeProjectsPath, { withFileTypes: true });
    for (const projectDir of projectDirs.filter((entry) => entry.isDirectory())) {
      const directoryPath = path.join(claudeProjectsPath, projectDir.name);
      const recentFiles = await listRecentFiles(
        directoryPath,
        (fileName) => fileName.endsWith(".jsonl"),
        sessionFileLimit
      );
      const fallbackRootPath = projectDir.name.replace(/-/g, "/");

      for (const file of recentFiles) {
        const discoveredSession = await parseClaudeSession(file.filePath, fallbackRootPath, file.updatedAt);
        if (discoveredSession) {
          addDiscoveredSession(projectsByRoot, discoveredSession);
        }
      }
    }
  } catch {
    // Missing local Claude sessions should not fail the discovery endpoint.
  }
}

async function parseCodexSession(
  filePath: string,
  fallbackUpdatedAt: string
): Promise<DiscoverySessionInput | null> {
  let sessionId = path.basename(filePath, ".jsonl");
  let rootPath = "";
  let summary = "";
  let lastActivity = fallbackUpdatedAt;

  const stream = createReadStream(filePath, { encoding: "utf8" });
  const reader = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  });

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

      const candidateLastActivity =
        parseTimestamp(parsed.timestamp) ??
        parseTimestamp(parsed.updatedAt) ??
        parseTimestamp(parsed.createdAt);
      if (shouldReplaceLastActivity(candidateLastActivity, lastActivity)) {
        lastActivity = candidateLastActivity!;
      }

      if (
        parsed.type === "session_meta" &&
        asRecord(parsed.payload)
      ) {
        const payload = asRecord(parsed.payload)!;

        if (typeof payload.cwd === "string" && payload.cwd.trim()) {
          rootPath = payload.cwd.trim();
        }

        if (typeof payload.id === "string" && payload.id.trim()) {
          sessionId = payload.id.trim();
        }
      }

      if (summary) {
        continue;
      }

      if (
        parsed.type === "event_msg" &&
        asRecord(parsed.payload)?.type === "user_message" &&
        typeof asRecord(parsed.payload)?.message === "string"
      ) {
        summary = String(asRecord(parsed.payload)?.message).trim();
        continue;
      }

      if (
        parsed.type === "response_item" &&
        asRecord(parsed.payload)?.type === "message" &&
        asRecord(parsed.payload)?.role === "user"
      ) {
        const payload = asRecord(parsed.payload)!;
        const text =
          "content" in payload
            ? extractText(payload.content)
            : "";
        if (text && !looksLikeSystemText(text)) {
          summary = text;
        }
      }
    }
  } finally {
    reader.close();
    stream.destroy();
  }

  if (!rootPath.trim()) {
    return null;
  }

  return {
    provider: "codex",
    sessionId,
    rootPath,
    summary: summary || path.basename(rootPath),
    sourcePath: filePath,
    lastActivity
  };
}

async function discoverCodexProjects(
  homeDir: string,
  projectsByRoot: Map<string, DiscoveryAccumulator>,
  sessionFileLimit: number
): Promise<void> {
  const codexSessionsPath = path.join(homeDir, ".codex", "sessions");

  try {
    const files = await collectFilesRecursively(codexSessionsPath, (fileName) => fileName.endsWith(".jsonl"));
    const recentFiles = files
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
      .slice(0, Math.min(sessionFileLimit, MAX_CODEX_SESSION_FILES));

    for (const file of recentFiles) {
      const discoveredSession = await parseCodexSession(file.filePath, file.updatedAt);
      if (discoveredSession) {
        addDiscoveredSession(projectsByRoot, discoveredSession);
      }
    }
  } catch {
    // Missing local Codex sessions should not fail the discovery endpoint.
  }
}

async function parseGeminiSession(
  rootPath: string,
  filePath: string,
  fallbackUpdatedAt: string
): Promise<DiscoverySessionInput | null> {
  try {
    const content = await readFile(filePath, "utf8");
    const parsed = JSON.parse(content) as {
      sessionId?: string;
      lastUpdated?: string;
      startTime?: string;
      messages?: Array<{
        type?: string;
        role?: string;
        content?: unknown;
      }>;
    };

    const sessionId = parsed.sessionId?.trim() || path.basename(filePath, ".json");
    const lastActivity =
      parseTimestamp(parsed.lastUpdated) ??
      parseTimestamp(parsed.startTime) ??
      fallbackUpdatedAt;

    const summary =
      parsed.messages
        ?.map((message) => {
          const role = message.type ?? message.role;
          if (role !== "user") {
            return "";
          }

          return extractText(message.content);
        })
        .find((value) => value.trim() && !looksLikeSystemText(value)) ?? path.basename(rootPath);

    return {
      provider: "gemini",
      sessionId,
      rootPath,
      summary,
      sourcePath: filePath,
      lastActivity
    };
  } catch {
    return null;
  }
}

async function discoverGeminiProjects(
  homeDir: string,
  projectsByRoot: Map<string, DiscoveryAccumulator>,
  sessionFileLimit: number,
  knownProjectRoots: string[]
): Promise<void> {
  const geminiTempPath = path.join(homeDir, ".gemini", "tmp");

  try {
    const projectDirs = await readdir(geminiTempPath, { withFileTypes: true });
    for (const projectDir of projectDirs.filter((entry) => entry.isDirectory())) {
      const projectDirectoryPath = path.join(geminiTempPath, projectDir.name);
      let rootPath = "";
      try {
        rootPath = (await readFile(path.join(projectDirectoryPath, ".project_root"), "utf8")).trim();
      } catch {
        continue;
      }

      if (!rootPath) {
        continue;
      }

      const chatsDirectoryPath = path.join(projectDirectoryPath, "chats");
      const recentFiles = await listRecentFiles(
        chatsDirectoryPath,
        (fileName) => fileName.endsWith(".json"),
        sessionFileLimit
      ).catch(() => []);

      for (const file of recentFiles) {
        const discoveredSession = await parseGeminiSession(rootPath, file.filePath, file.updatedAt);
        if (discoveredSession) {
          addDiscoveredSession(projectsByRoot, discoveredSession);
        }
      }
    }
  } catch {
    // Missing local Gemini sessions should not fail the discovery endpoint.
  }

  for (const knownRootPath of [...new Set(knownProjectRoots.map((rootPath) => path.resolve(rootPath.trim())).filter(Boolean))]) {
    const projectDirectoryPath = path.join(geminiTempPath, buildGeminiProjectHash(knownRootPath));
    const recentFiles = await listRecentFiles(
      path.join(projectDirectoryPath, "chats"),
      (fileName) => fileName.endsWith(".json"),
      sessionFileLimit
    ).catch(() => []);

    for (const file of recentFiles) {
      const discoveredSession = await parseGeminiSession(knownRootPath, file.filePath, file.updatedAt);
      if (discoveredSession) {
        addDiscoveredSession(projectsByRoot, discoveredSession);
      }
    }

    const logsFilePath = path.join(projectDirectoryPath, "logs.json");
    const logsStat = await stat(logsFilePath).catch(() => null);
    if (!logsStat?.isFile()) {
      continue;
    }

    const discoveredSessions = await parseGeminiLogSessions(
      knownRootPath,
      logsFilePath,
      logsStat.mtime.toISOString()
    );
    for (const discoveredSession of discoveredSessions) {
      addDiscoveredSession(projectsByRoot, discoveredSession);
    }
  }
}

function finalizeDiscoveredProjects(
  projectsByRoot: Map<string, DiscoveryAccumulator>,
  sessionPreviewLimit: number
): DiscoveredProjectRecord[] {
  return [...projectsByRoot.values()]
    .map((project) => {
      const sessions = [...project.sessions]
        .sort((left, right) => {
          const rightActivity = right.lastActivity ? new Date(right.lastActivity).getTime() : 0;
          const leftActivity = left.lastActivity ? new Date(left.lastActivity).getTime() : 0;
          return rightActivity - leftActivity;
        })
        .slice(0, sessionPreviewLimit);

      const providers = [...project.providers].sort((left, right) => left.localeCompare(right));
      return {
        id: buildProjectId(project.rootPath),
        name: project.name,
        rootPath: project.rootPath,
        providers,
        sessionCount: project.sessionCount,
        lastActivity: project.lastActivity,
        sessions
      };
    })
    .sort((left, right) => {
      const rightActivity = right.lastActivity ? new Date(right.lastActivity).getTime() : 0;
      const leftActivity = left.lastActivity ? new Date(left.lastActivity).getTime() : 0;
      if (rightActivity !== leftActivity) {
        return rightActivity - leftActivity;
      }

      return left.name.localeCompare(right.name);
    });
}

export async function discoverLocalProjects(
  input: {
    homeDir?: string;
    knownProjectRoots?: string[];
    sessionPreviewLimit?: number;
    sessionScanLimit?: number;
  } = {}
): Promise<DiscoveredProjectRecord[]> {
  const homeDir = input.homeDir ?? os.homedir();
  const sessionPreviewLimit = input.sessionPreviewLimit ?? DEFAULT_PROJECT_SESSION_PREVIEW_LIMIT;
  const sessionScanLimit = input.sessionScanLimit ?? sessionPreviewLimit;
  const projectsByRoot = new Map<string, DiscoveryAccumulator>();

  await Promise.all([
    discoverClaudeProjects(homeDir, projectsByRoot, sessionScanLimit),
    discoverCodexProjects(homeDir, projectsByRoot, sessionScanLimit),
    discoverGeminiProjects(homeDir, projectsByRoot, sessionScanLimit, input.knownProjectRoots ?? [])
  ]);

  return finalizeDiscoveredProjects(projectsByRoot, sessionPreviewLimit);
}
