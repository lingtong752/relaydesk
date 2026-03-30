import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { CliMcpServerRecord, ProjectSettingsSummary, ProjectSettingsUpdateInput } from "@shared";
import { readProjectSettingsSummary } from "./settingsSummary.js";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

interface SettingsSyncOptions {
  projectId: string;
  projectRootPath: string;
  update: ProjectSettingsUpdateInput;
  homeDir?: string;
}

interface CodexConfigPaths {
  globalPath: string;
  projectPath: string;
}

interface ClaudeConfigPaths {
  globalSettingsPath: string;
  projectSettingsPath: string;
  projectLocalSettingsPath: string;
  statePath: string;
  projectMcpPath: string;
}

interface GeminiConfigPaths {
  globalSettingsPath: string;
  projectSettingsPath: string;
  antigravityMcpPath: string;
}

interface TomlSectionBlock {
  headerLine: string;
  name: string;
  lines: string[];
}

interface TomlDocument {
  topLevelLines: string[];
  sections: TomlSectionBlock[];
}

export class SettingsSyncError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "SettingsSyncError";
    this.statusCode = statusCode;
  }
}

export async function saveProjectSettings(
  options: SettingsSyncOptions
): Promise<ProjectSettingsSummary> {
  const homeDir = options.homeDir ?? os.homedir();

  if (options.update.provider === "claude") {
    await saveClaudeSettings({
      homeDir,
      projectRootPath: options.projectRootPath,
      update: options.update
    });
  } else if (options.update.provider === "codex") {
    await saveCodexSettings({
      homeDir,
      projectRootPath: options.projectRootPath,
      update: options.update
    });
  } else if (options.update.provider === "gemini") {
    await saveGeminiSettings({
      homeDir,
      projectRootPath: options.projectRootPath,
      update: options.update
    });
  } else {
    throw new SettingsSyncError(400, `Saving settings for ${options.update.provider} is not supported yet`);
  }

  return readProjectSettingsSummary({
    projectId: options.projectId,
    projectRootPath: options.projectRootPath,
    homeDir
  });
}

async function saveClaudeSettings(input: {
  homeDir: string;
  projectRootPath: string;
  update: ProjectSettingsUpdateInput;
}): Promise<void> {
  const paths: ClaudeConfigPaths = {
    globalSettingsPath: path.join(input.homeDir, ".claude", "settings.json"),
    projectSettingsPath: path.join(input.projectRootPath, ".claude", "settings.json"),
    projectLocalSettingsPath: path.join(input.projectRootPath, ".claude", "settings.local.json"),
    statePath: path.join(input.homeDir, ".claude.json"),
    projectMcpPath: path.join(input.projectRootPath, ".mcp.json")
  };

  const modelSettingsTarget = await chooseClaudeSettingsTarget(paths);
  await updateJsonFile(modelSettingsTarget, (document) => {
    const env = ensureRecord(document, "env");
    setStringOrDelete(env, "ANTHROPIC_MODEL", normalizeOptionalString(input.update.model));
    setStringOrDelete(
      env,
      "ANTHROPIC_REASONING_MODEL",
      normalizeOptionalString(input.update.reasoningEffort)
    );
    cleanupEmptyObject(document, "env");
  });

  const normalizedServers = normalizeEditableMcpServers(input.update.mcpServers ?? []);
  const claudeServers = splitClaudeServers(normalizedServers, paths);

  await updateJsonFile(paths.projectLocalSettingsPath, (document) => {
    const permissions = ensureRecord(document, "permissions");
    setStringArrayOrDelete(permissions, "allow", normalizeStringList(input.update.allowedTools));
    setStringArrayOrDelete(permissions, "deny", normalizeStringList(input.update.disallowedTools));
    cleanupEmptyObject(document, "permissions");

    const enabledProjectServers = claudeServers.projectFileServers
      .filter((server) => server.enabled !== false)
      .map((server) => server.name);
    const disabledProjectServers = claudeServers.projectFileServers
      .filter((server) => server.enabled === false)
      .map((server) => server.name);

    setStringArrayOrDelete(document, "enabledMcpjsonServers", enabledProjectServers);
    setStringArrayOrDelete(document, "disabledMcpjsonServers", disabledProjectServers);
  });

  await updateJsonFile(paths.projectMcpPath, (document) => {
    setRecordOrDelete(
      document,
      "mcpServers",
      buildClaudeMcpRecord(claudeServers.projectFileServers)
    );
  });

  await updateJsonFile(paths.statePath, (document) => {
    setRecordOrDelete(document, "mcpServers", buildClaudeMcpRecord(claudeServers.globalServers));

    const projects = ensureRecord(document, "projects");
    const projectKey = path.resolve(input.projectRootPath);
    const currentProject = ensureNestedRecord(projects, projectKey);

    setRecordOrDelete(currentProject, "mcpServers", buildClaudeMcpRecord(claudeServers.projectStateServers));

    if (Object.keys(currentProject).length === 0) {
      delete projects[projectKey];
    }

    if (Object.keys(projects).length === 0) {
      delete document.projects;
    }
  });
}

async function chooseClaudeSettingsTarget(paths: ClaudeConfigPaths): Promise<string> {
  if (await fileExists(paths.projectLocalSettingsPath)) {
    return paths.projectLocalSettingsPath;
  }

  if (await fileExists(paths.projectSettingsPath)) {
    return paths.projectLocalSettingsPath;
  }

  return paths.globalSettingsPath;
}

function splitClaudeServers(
  servers: CliMcpServerRecord[],
  paths: ClaudeConfigPaths
): {
  globalServers: CliMcpServerRecord[];
  projectStateServers: CliMcpServerRecord[];
  projectFileServers: CliMcpServerRecord[];
} {
  const normalizedStatePath = path.resolve(paths.statePath);
  const normalizedProjectMcpPath = path.resolve(paths.projectMcpPath);

  const globalServers: CliMcpServerRecord[] = [];
  const projectStateServers: CliMcpServerRecord[] = [];
  const projectFileServers: CliMcpServerRecord[] = [];

  for (const server of servers) {
    const normalizedSourcePath = server.sourcePath ? safeResolve(server.sourcePath) : null;
    if (server.scope === "global") {
      globalServers.push({
        ...server,
        sourcePath: paths.statePath
      });
      continue;
    }

    if (normalizedSourcePath === normalizedStatePath) {
      projectStateServers.push({
        ...server,
        sourcePath: paths.statePath
      });
      continue;
    }

    if (!normalizedSourcePath || normalizedSourcePath === normalizedProjectMcpPath) {
      projectFileServers.push({
        ...server,
        sourcePath: paths.projectMcpPath
      });
      continue;
    }

    projectFileServers.push({
      ...server,
      sourcePath: paths.projectMcpPath
    });
  }

  return {
    globalServers: dedupeServersByName(globalServers),
    projectStateServers: dedupeServersByName(projectStateServers),
    projectFileServers: dedupeServersByName(projectFileServers)
  };
}

function buildClaudeMcpRecord(servers: CliMcpServerRecord[]): Record<string, JsonValue> | null {
  if (servers.length === 0) {
    return null;
  }

  return Object.fromEntries(
    servers.map((server) => [
      server.name,
      buildClaudeMcpEntry(server)
    ])
  );
}

function buildClaudeMcpEntry(server: CliMcpServerRecord): Record<string, JsonValue> {
  const record: Record<string, JsonValue> = {};

  if (server.command) {
    record.command = server.command;
    record.transportType = "stdio";
  }

  if (server.url) {
    record.url = server.url;
    record.type = server.transport === "sse" ? "sse" : "http";
  }

  return record;
}

async function saveCodexSettings(input: {
  homeDir: string;
  projectRootPath: string;
  update: ProjectSettingsUpdateInput;
}): Promise<void> {
  const paths: CodexConfigPaths = {
    globalPath: path.join(input.homeDir, ".codex", "config.toml"),
    projectPath: path.join(input.projectRootPath, ".codex", "config.toml")
  };
  const topLevelTargetPath = await chooseCodexTopLevelTarget(paths);
  const normalizedServers = normalizeEditableMcpServers(input.update.mcpServers ?? []);
  const groupedServers = splitCodexServers(normalizedServers, paths);

  await updateCodexConfigFile(topLevelTargetPath, {
    model: normalizeOptionalString(input.update.model),
    reasoningEffort: normalizeOptionalString(input.update.reasoningEffort),
    approvalPolicy: normalizeOptionalString(input.update.approvalPolicy),
    sandboxMode: normalizeOptionalString(input.update.sandboxMode),
    mcpServers:
      topLevelTargetPath === paths.projectPath
        ? groupedServers.projectServers
        : groupedServers.globalServers
  });

  const secondaryPath =
    topLevelTargetPath === paths.projectPath ? paths.globalPath : paths.projectPath;
  const secondaryServers =
    topLevelTargetPath === paths.projectPath
      ? groupedServers.globalServers
      : groupedServers.projectServers;

  await updateCodexConfigFile(secondaryPath, {
    mcpServers: secondaryServers
  });
}

async function saveGeminiSettings(input: {
  homeDir: string;
  projectRootPath: string;
  update: ProjectSettingsUpdateInput;
}): Promise<void> {
  const paths: GeminiConfigPaths = {
    globalSettingsPath: path.join(input.homeDir, ".gemini", "settings.json"),
    projectSettingsPath: path.join(input.projectRootPath, ".gemini", "settings.json"),
    antigravityMcpPath: path.join(input.homeDir, ".gemini", "antigravity", "mcp_config.json")
  };

  const topLevelTargetPath = await chooseGeminiTopLevelTarget(paths);
  const normalizedServers = normalizeEditableMcpServers(input.update.mcpServers ?? []);
  const groupedServers = splitGeminiServers(normalizedServers, paths);

  await updateJsonFile(topLevelTargetPath, (document) => {
    setStringOrDelete(document, "model", normalizeOptionalString(input.update.model));
    setStringOrDelete(
      document,
      "reasoningEffort",
      normalizeOptionalString(input.update.reasoningEffort)
    );
    setStringOrDelete(document, "approvalPolicy", normalizeOptionalString(input.update.approvalPolicy));
    setStringOrDelete(document, "sandboxMode", normalizeOptionalString(input.update.sandboxMode));
    setStringArrayOrDelete(document, "allowedTools", normalizeStringList(input.update.allowedTools));
    setStringArrayOrDelete(
      document,
      "disallowedTools",
      normalizeStringList(input.update.disallowedTools)
    );
    delete document.mcpServers;
  });

  await updateJsonFile(paths.projectSettingsPath, (document) => {
    if (topLevelTargetPath !== paths.projectSettingsPath) {
      delete document.model;
      delete document.reasoningEffort;
      delete document.approvalPolicy;
      delete document.sandboxMode;
      delete document.allowedTools;
      delete document.disallowedTools;
    }

    setRecordOrDelete(document, "mcpServers", buildGeminiMcpRecord(groupedServers.projectServers));
  });

  await updateJsonFile(paths.antigravityMcpPath, (document) => {
    setRecordOrDelete(document, "mcpServers", buildGeminiMcpRecord(groupedServers.globalServers));
  });
}

async function chooseCodexTopLevelTarget(paths: CodexConfigPaths): Promise<string> {
  return (await fileExists(paths.projectPath)) ? paths.projectPath : paths.globalPath;
}

async function chooseGeminiTopLevelTarget(paths: GeminiConfigPaths): Promise<string> {
  return paths.projectSettingsPath;
}

function splitCodexServers(
  servers: CliMcpServerRecord[],
  paths: CodexConfigPaths
): {
  globalServers: CliMcpServerRecord[];
  projectServers: CliMcpServerRecord[];
} {
  const normalizedGlobalPath = path.resolve(paths.globalPath);
  const normalizedProjectPath = path.resolve(paths.projectPath);

  const globalServers: CliMcpServerRecord[] = [];
  const projectServers: CliMcpServerRecord[] = [];

  for (const server of servers) {
    const normalizedSourcePath = server.sourcePath ? safeResolve(server.sourcePath) : null;
    if (server.scope === "global" || normalizedSourcePath === normalizedGlobalPath) {
      globalServers.push({
        ...server,
        sourcePath: paths.globalPath
      });
      continue;
    }

    if (normalizedSourcePath === normalizedProjectPath || server.scope === "project") {
      projectServers.push({
        ...server,
        sourcePath: paths.projectPath
      });
      continue;
    }

    projectServers.push({
      ...server,
      sourcePath: paths.projectPath
    });
  }

  return {
    globalServers: dedupeServersByName(globalServers),
    projectServers: dedupeServersByName(projectServers)
  };
}

function splitGeminiServers(
  servers: CliMcpServerRecord[],
  paths: GeminiConfigPaths
): {
  globalServers: CliMcpServerRecord[];
  projectServers: CliMcpServerRecord[];
} {
  const normalizedGlobalSettingsPath = path.resolve(paths.globalSettingsPath);
  const normalizedProjectSettingsPath = path.resolve(paths.projectSettingsPath);
  const normalizedAntigravityPath = path.resolve(paths.antigravityMcpPath);

  const globalServers: CliMcpServerRecord[] = [];
  const projectServers: CliMcpServerRecord[] = [];

  for (const server of servers) {
    const normalizedSourcePath = server.sourcePath ? safeResolve(server.sourcePath) : null;
    if (
      server.scope === "global" ||
      normalizedSourcePath === normalizedGlobalSettingsPath ||
      normalizedSourcePath === normalizedAntigravityPath
    ) {
      globalServers.push({
        ...server,
        sourcePath: paths.antigravityMcpPath
      });
      continue;
    }

    if (normalizedSourcePath === normalizedProjectSettingsPath || server.scope === "project") {
      projectServers.push({
        ...server,
        sourcePath: paths.projectSettingsPath
      });
      continue;
    }

    projectServers.push({
      ...server,
      sourcePath: paths.projectSettingsPath
    });
  }

  return {
    globalServers: dedupeServersByName(globalServers),
    projectServers: dedupeServersByName(projectServers)
  };
}

async function updateCodexConfigFile(
  filePath: string,
  input: {
    model?: string | null;
    reasoningEffort?: string | null;
    approvalPolicy?: string | null;
    sandboxMode?: string | null;
    mcpServers?: CliMcpServerRecord[];
  }
): Promise<void> {
  const raw = await readFile(filePath, "utf8").catch(() => "");
  const document = parseTomlDocument(raw);
  const shouldManageTopLevel =
    input.model !== undefined ||
    input.reasoningEffort !== undefined ||
    input.approvalPolicy !== undefined ||
    input.sandboxMode !== undefined;

  if (shouldManageTopLevel) {
    const managedTopLevelKeys = new Set([
      "model",
      "model_reasoning_effort",
      "approval_policy",
      "sandbox_mode"
    ]);
    document.topLevelLines = document.topLevelLines.filter(
      (line) => !matchesManagedTomlKey(line, managedTopLevelKeys)
    );
  }

  const topLevelAssignments = [
    input.model ? `model = ${quoteTomlString(input.model)}` : null,
    input.reasoningEffort
      ? `model_reasoning_effort = ${quoteTomlString(input.reasoningEffort)}`
      : null,
    input.approvalPolicy
      ? `approval_policy = ${quoteTomlString(input.approvalPolicy)}`
      : null,
    input.sandboxMode ? `sandbox_mode = ${quoteTomlString(input.sandboxMode)}` : null
  ].filter((line): line is string => Boolean(line));

  if (shouldManageTopLevel && topLevelAssignments.length > 0) {
    if (
      document.topLevelLines.length > 0 &&
      document.topLevelLines[document.topLevelLines.length - 1]?.trim()
    ) {
      document.topLevelLines.push("");
    }
    document.topLevelLines.push(...topLevelAssignments);
  }

  document.sections = document.sections.filter(
    (section) => !section.name.startsWith("mcp_servers.")
  );

  const servers = dedupeServersByName(input.mcpServers ?? []);
  for (const server of servers) {
    document.sections.push(createCodexMcpSection(server));
  }

  await ensureParentDirectory(filePath);
  await writeFile(filePath, renderTomlDocument(document), "utf8");
}

function parseTomlDocument(raw: string): TomlDocument {
  const topLevelLines: string[] = [];
  const sections: TomlSectionBlock[] = [];
  let currentSection: TomlSectionBlock | null = null;

  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    const sectionMatch = trimmed.match(/^\[(.+)\]$/u);
    if (sectionMatch) {
      if (currentSection) {
        sections.push(currentSection);
      }

      currentSection = {
        headerLine: line,
        name: normalizeTomlSectionName(sectionMatch[1] ?? ""),
        lines: []
      };
      continue;
    }

    if (currentSection) {
      currentSection.lines.push(line);
    } else {
      topLevelLines.push(line);
    }
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  while (topLevelLines.length > 0 && topLevelLines[topLevelLines.length - 1] === "") {
    topLevelLines.pop();
  }

  return {
    topLevelLines,
    sections
  };
}

function renderTomlDocument(document: TomlDocument): string {
  const blocks: string[] = [];

  if (document.topLevelLines.length > 0) {
    blocks.push(trimTrailingBlankLines(document.topLevelLines).join("\n"));
  }

  for (const section of document.sections) {
    const lines = [section.headerLine, ...trimTrailingBlankLines(section.lines)];
    blocks.push(lines.join("\n"));
  }

  return `${blocks.filter(Boolean).join("\n\n").trimEnd()}\n`;
}

function createCodexMcpSection(server: CliMcpServerRecord): TomlSectionBlock {
  const sectionName = formatTomlSectionName(`mcp_servers.${server.name}`);
  const lines: string[] = [];

  if (server.command) {
    lines.push(`command = ${quoteTomlString(server.command)}`);
  }

  if (server.url) {
    lines.push(`url = ${quoteTomlString(server.url)}`);
  }

  if (typeof server.enabled === "boolean") {
    lines.push(`enabled = ${server.enabled ? "true" : "false"}`);
  }

  return {
    headerLine: `[${sectionName}]`,
    name: `mcp_servers.${server.name}`,
    lines
  };
}

function buildGeminiMcpRecord(servers: CliMcpServerRecord[]): Record<string, JsonValue> | null {
  if (servers.length === 0) {
    return null;
  }

  return Object.fromEntries(
    servers.map((server) => [
      server.name,
      {
        ...(server.command ? { command: server.command } : {}),
        ...(server.url ? { url: server.url } : {}),
        ...(typeof server.enabled === "boolean" ? { enabled: server.enabled } : {})
      }
    ])
  );
}

function matchesManagedTomlKey(line: string, keys: Set<string>): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return false;
  }

  const match = trimmed.match(/^([A-Za-z0-9_.-]+)\s*=/u);
  return match ? keys.has(match[1] ?? "") : false;
}

function normalizeTomlSectionName(section: string): string {
  if (!section.includes("\"")) {
    return section;
  }

  return section.replace(/"([^"]+)"/gu, "$1");
}

function formatTomlSectionName(sectionName: string): string {
  const [prefix, suffix = ""] = sectionName.split(".", 2);
  return /^[A-Za-z0-9_-]+$/u.test(suffix)
    ? `${prefix}.${suffix}`
    : `${prefix}.${quoteTomlString(suffix)}`;
}

function trimTrailingBlankLines(lines: string[]): string[] {
  const normalized = [...lines];
  while (normalized.length > 0 && normalized[normalized.length - 1] === "") {
    normalized.pop();
  }
  return normalized;
}

function quoteTomlString(value: string): string {
  return JSON.stringify(value);
}

function normalizeEditableMcpServers(servers: CliMcpServerRecord[]): CliMcpServerRecord[] {
  return dedupeServersByName(
    servers
      .map((server) => ({
        ...server,
        name: server.name.trim(),
        command: normalizeOptionalString(server.command) ?? undefined,
        url: normalizeOptionalString(server.url) ?? undefined,
        sourcePath: server.sourcePath.trim()
      }))
      .filter((server) => {
        if (!server.name) {
          return false;
        }

        if (server.transport === "stdio") {
          return Boolean(server.command);
        }

        return Boolean(server.url || server.command);
      })
  );
}

function dedupeServersByName(servers: CliMcpServerRecord[]): CliMcpServerRecord[] {
  const seen = new Set<string>();
  const result: CliMcpServerRecord[] = [];

  for (const server of servers) {
    const key = `${server.scope}::${server.name}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(server);
  }

  return result;
}

async function updateJsonFile(
  filePath: string,
  updater: (document: Record<string, JsonValue>) => void
): Promise<void> {
  const existing = parseJsonDocument(await readFile(filePath, "utf8").catch(() => ""));
  const document = existing ?? {};
  updater(document);
  await ensureParentDirectory(filePath);
  await writeFile(filePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
}

async function ensureParentDirectory(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath, "utf8");
    return true;
  } catch {
    return false;
  }
}

function parseJsonDocument(raw: string): Record<string, JsonValue> | null {
  if (!raw.trim()) {
    return null;
  }

  try {
    return JSON.parse(raw) as Record<string, JsonValue>;
  } catch {
    try {
      const withoutComments = stripJsonComments(raw);
      const normalized = withoutComments.replace(/,\s*([}\]])/gu, "$1");
      return JSON.parse(normalized) as Record<string, JsonValue>;
    } catch {
      return null;
    }
  }
}

function stripJsonComments(raw: string): string {
  let result = "";
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;

  for (let index = 0; index < raw.length; index += 1) {
    const current = raw[index] ?? "";
    const next = raw[index + 1] ?? "";

    if (inLineComment) {
      if (current === "\n") {
        inLineComment = false;
        result += current;
      }
      continue;
    }

    if (inBlockComment) {
      if (current === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (inString) {
      result += current;
      if (escaped) {
        escaped = false;
      } else if (current === "\\") {
        escaped = true;
      } else if (current === "\"") {
        inString = false;
      }
      continue;
    }

    if (current === "\"") {
      inString = true;
      result += current;
      continue;
    }

    if (current === "/" && next === "/") {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (current === "/" && next === "*") {
      inBlockComment = true;
      index += 1;
      continue;
    }

    result += current;
  }

  return result;
}

function ensureRecord(
  document: Record<string, JsonValue>,
  key: string
): Record<string, JsonValue> {
  const existing = document[key];
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return existing as Record<string, JsonValue>;
  }

  const created: Record<string, JsonValue> = {};
  document[key] = created;
  return created;
}

function ensureNestedRecord(
  document: Record<string, JsonValue>,
  key: string
): Record<string, JsonValue> {
  const existing = document[key];
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return existing as Record<string, JsonValue>;
  }

  const created: Record<string, JsonValue> = {};
  document[key] = created;
  return created;
}

function cleanupEmptyObject(document: Record<string, JsonValue>, key: string): void {
  const value = document[key];
  if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) {
    delete document[key];
  }
}

function setStringOrDelete(
  document: Record<string, JsonValue>,
  key: string,
  value: string | null
): void {
  if (value) {
    document[key] = value;
  } else {
    delete document[key];
  }
}

function setStringArrayOrDelete(
  document: Record<string, JsonValue>,
  key: string,
  values: string[]
): void {
  if (values.length > 0) {
    document[key] = values;
  } else {
    delete document[key];
  }
}

function setRecordOrDelete(
  document: Record<string, JsonValue>,
  key: string,
  value: Record<string, JsonValue> | null
): void {
  if (value && Object.keys(value).length > 0) {
    document[key] = value;
  } else {
    delete document[key];
  }
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeStringList(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function safeResolve(filePath: string): string {
  try {
    return path.resolve(filePath);
  } catch {
    return filePath;
  }
}
