import { access, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  CliConfigSourceRecord,
  CliMcpServerRecord,
  ProjectSettingsSummary,
  ProviderId,
  ProviderSettingsRecord,
  ProviderSettingsStatus
} from "@shared";

interface SettingsSummaryOptions {
  projectId: string;
  projectRootPath: string;
  homeDir?: string;
}

interface LoadedConfigSource {
  source: CliConfigSourceRecord;
  text: string | null;
}

interface ConfigSourceInput {
  label: string;
  path: string;
  scope: "global" | "project";
}

interface ParsedTomlConfig {
  topLevel: Record<string, string | boolean | string[]>;
  mcpServers: CliMcpServerRecord[];
}

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export async function readProjectSettingsSummary(
  options: SettingsSummaryOptions
): Promise<ProjectSettingsSummary> {
  const homeDir = options.homeDir ?? os.homedir();

  const providers = await Promise.all([
    summarizeCodexConfig(options.projectRootPath, homeDir),
    summarizeClaudeConfig(options.projectRootPath, homeDir),
    summarizeCursorConfig(options.projectRootPath, homeDir),
    summarizeGeminiConfig(options.projectRootPath, homeDir)
  ]);

  return {
    projectId: options.projectId,
    projectRootPath: options.projectRootPath,
    providers,
    collectedAt: new Date().toISOString()
  };
}

async function summarizeCodexConfig(
  projectRootPath: string,
  homeDir: string
): Promise<ProviderSettingsRecord> {
  const globalConfig = await loadConfigSource({
    label: "Codex 全局配置",
    path: path.join(homeDir, ".codex", "config.toml"),
    scope: "global"
  });
  const projectConfig = await loadConfigSource({
    label: "Codex 项目配置",
    path: path.join(projectRootPath, ".codex", "config.toml"),
    scope: "project"
  });

  const parsedGlobal = parseTomlConfig(globalConfig.text, "codex", globalConfig.source.path, "global");
  const parsedProject = parseTomlConfig(projectConfig.text, "codex", projectConfig.source.path, "project");
  const model = firstDefinedString(
    parsedProject.topLevel.model,
    parsedGlobal.topLevel.model
  );
  const reasoningEffort = firstDefinedString(
    parsedProject.topLevel.model_reasoning_effort,
    parsedGlobal.topLevel.model_reasoning_effort
  );
  const approvalPolicy = firstDefinedString(
    parsedProject.topLevel.approval_policy,
    parsedGlobal.topLevel.approval_policy
  );
  const sandboxMode = firstDefinedString(
    parsedProject.topLevel.sandbox_mode,
    parsedGlobal.topLevel.sandbox_mode
  );
  const toolPermissionMode = [approvalPolicy ? `approval=${approvalPolicy}` : null, sandboxMode ? `sandbox=${sandboxMode}` : null]
    .filter(Boolean)
    .join(" · ");
  const mcpServers = [...parsedGlobal.mcpServers, ...parsedProject.mcpServers];
  const notes = projectConfig.source.exists
    ? ["项目级 `.codex/config.toml` 的同名配置会覆盖全局设置。"]
    : [];

  return buildProviderSettingsRecord({
    provider: "codex",
    sources: [globalConfig.source, projectConfig.source],
    model,
    reasoningEffort,
    approvalPolicy,
    sandboxMode,
    toolPermissionMode: toolPermissionMode || null,
    mcpServers,
    notes
  });
}

async function summarizeClaudeConfig(
  projectRootPath: string,
  homeDir: string
): Promise<ProviderSettingsRecord> {
  const settingsConfig = await loadConfigSource({
    label: "Claude settings.json",
    path: path.join(homeDir, ".claude", "settings.json"),
    scope: "global"
  });
  const projectSettingsConfig = await loadConfigSource({
    label: "Claude 项目 settings",
    path: path.join(projectRootPath, ".claude", "settings.json"),
    scope: "project"
  });
  const projectLocalSettingsConfig = await loadConfigSource({
    label: "Claude 项目 local settings",
    path: path.join(projectRootPath, ".claude", "settings.local.json"),
    scope: "project"
  });
  const stateConfig = await loadConfigSource({
    label: "Claude 状态缓存",
    path: path.join(homeDir, ".claude.json"),
    scope: "global"
  });
  const projectMcpConfig = await loadConfigSource({
    label: "Claude 项目 MCP",
    path: path.join(projectRootPath, ".mcp.json"),
    scope: "project"
  });

  const settingsJson = parseJsonDocument(settingsConfig.text);
  const projectSettingsJson = parseJsonDocument(projectSettingsConfig.text);
  const projectLocalSettingsJson = parseJsonDocument(projectLocalSettingsConfig.text);
  const stateJson = parseJsonDocument(stateConfig.text);
  const projectMcpJson = parseJsonDocument(projectMcpConfig.text);

  const globalEnv = asRecord(settingsJson?.env);
  const projectEnv = asRecord(projectSettingsJson?.env);
  const projectLocalEnv = asRecord(projectLocalSettingsJson?.env);
  const model =
    getString(projectLocalEnv?.ANTHROPIC_MODEL) ??
    getString(projectEnv?.ANTHROPIC_MODEL) ??
    getString(globalEnv?.ANTHROPIC_MODEL) ??
    getString(projectLocalEnv?.ANTHROPIC_DEFAULT_SONNET_MODEL) ??
    getString(projectEnv?.ANTHROPIC_DEFAULT_SONNET_MODEL) ??
    getString(globalEnv?.ANTHROPIC_DEFAULT_SONNET_MODEL) ??
    getString(projectLocalEnv?.ANTHROPIC_DEFAULT_OPUS_MODEL) ??
    getString(projectEnv?.ANTHROPIC_DEFAULT_OPUS_MODEL) ??
    getString(globalEnv?.ANTHROPIC_DEFAULT_OPUS_MODEL) ??
    null;
  const reasoningEffort =
    getString(projectLocalEnv?.ANTHROPIC_REASONING_MODEL) ??
    getString(projectEnv?.ANTHROPIC_REASONING_MODEL) ??
    getString(globalEnv?.ANTHROPIC_REASONING_MODEL) ??
    null;

  const projectEntries = asRecord(stateJson?.projects);
  const projectEntry = asRecord(projectEntries?.[path.resolve(projectRootPath)]);
  const projectPermissions =
    asRecord(projectLocalSettingsJson?.permissions) ??
    asRecord(projectSettingsJson?.permissions);
  const localSettingsDocument = projectLocalSettingsJson ?? {};
  const projectSettingsDocument = projectSettingsJson ?? {};
  const allowedTools = projectPermissions
    ? asStringArray(projectPermissions.allow)
    : asStringArray(projectEntry?.allowedTools);
  const disallowedTools = projectPermissions
    ? asStringArray(projectPermissions.deny)
    : asStringArray(projectEntry?.disallowedTools);
  const enabledMcpjsonServers = new Set(
    firstStringArray(
      asRecord(projectLocalSettingsJson?.permissions)
        ? asStringArray(localSettingsDocument.enabledMcpjsonServers)
        : null,
      asRecord(projectSettingsJson?.permissions)
        ? asStringArray(projectSettingsDocument.enabledMcpjsonServers)
        : null,
      asStringArray(projectEntry?.enabledMcpjsonServers)
    )
  );
  const disabledMcpjsonServers = new Set(
    firstStringArray(
      asRecord(projectLocalSettingsJson?.permissions)
        ? asStringArray(localSettingsDocument.disabledMcpjsonServers)
        : null,
      asRecord(projectSettingsJson?.permissions)
        ? asStringArray(projectSettingsDocument.disabledMcpjsonServers)
        : null,
      asStringArray(projectEntry?.disabledMcpjsonServers)
    )
  );
  const globalMcpServers = parseMcpServersObject({
    provider: "claude",
    rawServers: asRecord(stateJson?.mcpServers),
    scope: "global",
    sourcePath: stateConfig.source.path
  });
  const stateMcpServers = parseMcpServersObject({
    provider: "claude",
    rawServers: asRecord(projectEntry?.mcpServers),
    scope: "project",
    sourcePath: stateConfig.source.path
  });
  const projectMcpServers = parseMcpServersObject({
    provider: "claude",
    rawServers: asRecord(projectMcpJson?.mcpServers),
    scope: "project",
    sourcePath: projectMcpConfig.source.path,
    enabledMcpjsonServers,
    disabledMcpjsonServers
  });

  const notes: string[] = [];
  if (!projectPermissions && stateConfig.source.exists && !projectEntry) {
    notes.push("未在 `~/.claude.json` 中找到当前工作区的项目级条目。");
  }
  if (projectMcpConfig.source.exists && projectMcpServers.length === 0) {
    notes.push("已发现 `.mcp.json`，但未解析到可识别的 MCP server。");
  }

  return buildProviderSettingsRecord({
    provider: "claude",
    sources: [
      settingsConfig.source,
      projectSettingsConfig.source,
      projectLocalSettingsConfig.source,
      stateConfig.source,
      projectMcpConfig.source
    ],
    model,
    reasoningEffort,
    toolPermissionMode: allowedTools.length > 0 ? `allowlist(${allowedTools.length})` : null,
    allowedTools,
    disallowedTools,
    mcpServers: [...globalMcpServers, ...stateMcpServers, ...projectMcpServers],
    notes
  });
}

async function summarizeCursorConfig(
  projectRootPath: string,
  homeDir: string
): Promise<ProviderSettingsRecord> {
  const globalMcpConfig = await loadConfigSource({
    label: "Cursor 全局 MCP",
    path: path.join(homeDir, ".cursor", "mcp.json"),
    scope: "global"
  });
  const projectMcpConfig = await loadConfigSource({
    label: "Cursor 项目 MCP",
    path: path.join(projectRootPath, ".cursor", "mcp.json"),
    scope: "project"
  });
  const argvConfig = await loadConfigSource({
    label: "Cursor argv",
    path: path.join(homeDir, ".cursor", "argv.json"),
    scope: "global"
  });

  const globalJson = parseJsonDocument(globalMcpConfig.text);
  const projectJson = parseJsonDocument(projectMcpConfig.text);
  const mcpServers = [
    ...parseMcpServersObject({
      provider: "cursor",
      rawServers: asRecord(globalJson?.mcpServers),
      scope: "global",
      sourcePath: globalMcpConfig.source.path
    }),
    ...parseMcpServersObject({
      provider: "cursor",
      rawServers: asRecord(projectJson?.mcpServers),
      scope: "project",
      sourcePath: projectMcpConfig.source.path
    })
  ];
  const notes: string[] = [];
  if (argvConfig.source.exists && mcpServers.length === 0) {
    notes.push("检测到 Cursor 配置目录，但尚未发现 `mcp.json`。");
  }

  return buildProviderSettingsRecord({
    provider: "cursor",
    sources: [globalMcpConfig.source, projectMcpConfig.source, argvConfig.source],
    mcpServers,
    notes
  });
}

async function summarizeGeminiConfig(
  projectRootPath: string,
  homeDir: string
): Promise<ProviderSettingsRecord> {
  const globalSettings = await loadConfigSource({
    label: "Gemini 全局 settings",
    path: path.join(homeDir, ".gemini", "settings.json"),
    scope: "global"
  });
  const projectSettings = await loadConfigSource({
    label: "Gemini 项目 settings",
    path: path.join(projectRootPath, ".gemini", "settings.json"),
    scope: "project"
  });
  const antigravityMcpConfig = await loadConfigSource({
    label: "Gemini antigravity MCP",
    path: path.join(homeDir, ".gemini", "antigravity", "mcp_config.json"),
    scope: "global"
  });

  const globalJson = parseJsonDocument(globalSettings.text);
  const projectJson = parseJsonDocument(projectSettings.text);
  const antigravityJson = parseJsonDocument(antigravityMcpConfig.text);
  const model = getString(projectJson?.model) ?? getString(globalJson?.model) ?? null;
  const mcpServers = [
    ...parseMcpServersObject({
      provider: "gemini",
      rawServers: asRecord(globalJson?.mcpServers),
      scope: "global",
      sourcePath: globalSettings.source.path
    }),
    ...parseMcpServersObject({
      provider: "gemini",
      rawServers: asRecord(projectJson?.mcpServers),
      scope: "project",
      sourcePath: projectSettings.source.path
    }),
    ...parseMcpServersObject({
      provider: "gemini",
      rawServers: asRecord(antigravityJson?.mcpServers),
      scope: "global",
      sourcePath: antigravityMcpConfig.source.path
    })
  ];

  const notes: string[] = [];
  if (antigravityMcpConfig.source.exists && !antigravityMcpConfig.text?.trim()) {
    notes.push("检测到 `antigravity/mcp_config.json`，但文件当前为空。");
  } else if (antigravityMcpConfig.source.exists && antigravityMcpConfig.text && !antigravityJson) {
    notes.push("检测到 `antigravity/mcp_config.json`，但当前只支持读取标准 JSON 结构。");
  }

  return buildProviderSettingsRecord({
    provider: "gemini",
    sources: [globalSettings.source, projectSettings.source, antigravityMcpConfig.source],
    model,
    mcpServers,
    notes
  });
}

function buildProviderSettingsRecord(input: {
  provider: ProviderId;
  sources: CliConfigSourceRecord[];
  model?: string | null;
  reasoningEffort?: string | null;
  approvalPolicy?: string | null;
  sandboxMode?: string | null;
  toolPermissionMode?: string | null;
  allowedTools?: string[];
  disallowedTools?: string[];
  mcpServers?: CliMcpServerRecord[];
  notes?: string[];
}): ProviderSettingsRecord {
  const allowedTools = dedupeStrings(input.allowedTools ?? []);
  const disallowedTools = dedupeStrings(input.disallowedTools ?? []);
  const mcpServers = dedupeMcpServers(input.mcpServers ?? []);
  const notes = dedupeStrings(input.notes ?? []);
  const status = getProviderSettingsStatus({
    sources: input.sources,
    model: input.model ?? null,
    reasoningEffort: input.reasoningEffort ?? null,
    allowedTools,
    disallowedTools,
    mcpServers
  });

  return {
    provider: input.provider,
    status,
    summary: buildProviderSummary({
      status,
      sources: input.sources,
      model: input.model ?? null,
      reasoningEffort: input.reasoningEffort ?? null,
      toolPermissionMode: input.toolPermissionMode ?? null,
      allowedTools,
      mcpServers
    }),
    sources: input.sources,
    model: input.model ?? null,
    reasoningEffort: input.reasoningEffort ?? null,
    approvalPolicy: input.approvalPolicy ?? null,
    sandboxMode: input.sandboxMode ?? null,
    toolPermissionMode: input.toolPermissionMode ?? null,
    allowedTools,
    disallowedTools,
    mcpServers,
    notes
  };
}

function buildProviderSummary(input: {
  status: ProviderSettingsStatus;
  sources: CliConfigSourceRecord[];
  model: string | null;
  reasoningEffort: string | null;
  toolPermissionMode: string | null;
  allowedTools: string[];
  mcpServers: CliMcpServerRecord[];
}): string {
  if (input.status === "not_found") {
    return "未发现本地配置。";
  }

  const parts: string[] = [];
  if (input.model) {
    parts.push(`model=${input.model}`);
  }
  if (input.reasoningEffort) {
    parts.push(`reasoning=${input.reasoningEffort}`);
  }
  if (input.toolPermissionMode) {
    parts.push(input.toolPermissionMode);
  }
  if (input.allowedTools.length > 0) {
    parts.push(`${input.allowedTools.length} 个允许工具`);
  }
  if (input.mcpServers.length > 0) {
    parts.push(`${input.mcpServers.length} 个 MCP server`);
  }
  if (parts.length > 0) {
    return parts.join(" · ");
  }

  const existingSources = input.sources.filter((source) => source.exists).length;
  return `已发现 ${existingSources} 个配置源，等待后续同步写回。`;
}

function getProviderSettingsStatus(input: {
  sources: CliConfigSourceRecord[];
  model: string | null;
  reasoningEffort: string | null;
  allowedTools: string[];
  disallowedTools: string[];
  mcpServers: CliMcpServerRecord[];
}): ProviderSettingsStatus {
  const hasSources = input.sources.some((source) => source.exists);
  const hasData = Boolean(
    input.model ??
      input.reasoningEffort ??
      input.mcpServers.length ??
      input.allowedTools.length ??
      input.disallowedTools.length
  );

  if (!hasSources && !hasData) {
    return "not_found";
  }

  if (hasData) {
    return "configured";
  }

  return "partial";
}

async function loadConfigSource(source: ConfigSourceInput): Promise<LoadedConfigSource> {
  const exists = await fileExists(source.path);
  if (!exists) {
    return {
      source: { ...source, exists: false },
      text: null
    };
  }

  return {
    source: { ...source, exists: true },
    text: await readFile(source.path, "utf8")
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseTomlConfig(
  raw: string | null,
  provider: ProviderId,
  sourcePath: string,
  scope: "global" | "project"
): ParsedTomlConfig {
  if (!raw) {
    return {
      topLevel: {},
      mcpServers: []
    };
  }

  const topLevel: Record<string, string | boolean | string[]> = {};
  const mcpServers = new Map<string, CliMcpServerRecord>();
  let activeSection: string | null = null;

  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      activeSection = normalizeTomlSectionName(trimmed.slice(1, -1).trim());
      continue;
    }

    const match = trimmed.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/u);
    if (!match) {
      continue;
    }

    const key = match[1];
    const rawValue = match[2];
    if (!key || !rawValue) {
      continue;
    }

    const value = parseTomlValue(rawValue.trim());
    if (!activeSection) {
      if (typeof value === "string" || typeof value === "boolean" || Array.isArray(value)) {
        topLevel[key] = value;
      }
      continue;
    }

    if (!activeSection.startsWith("mcp_servers.")) {
      continue;
    }

    const serverName = activeSection.slice("mcp_servers.".length);
    const current = mcpServers.get(serverName) ?? {
      provider,
      name: serverName,
      scope,
      sourcePath,
      transport: "unknown" as const
    };

    if (key === "command" && typeof value === "string") {
      current.command = value;
      current.transport = "stdio";
    }

    if ((key === "url" || key === "server_url") && typeof value === "string") {
      current.url = value;
      current.transport = inferNetworkTransport(value);
    }

    if ((key === "transport" || key === "transport_type") && typeof value === "string") {
      current.transport = normalizeTransport(value, current.url ?? null, current.command ?? null);
    }

    mcpServers.set(serverName, current);
  }

  return {
    topLevel,
    mcpServers: [...mcpServers.values()]
  };
}

function parseTomlValue(value: string): string | boolean | string[] {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  if (value.startsWith("\"") && value.endsWith("\"")) {
    try {
      return JSON.parse(value) as string;
    } catch {
      return value.slice(1, -1);
    }
  }

  if (value.startsWith("[") && value.endsWith("]")) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    } catch {
      return [];
    }
  }

  return value;
}

function normalizeTomlSectionName(section: string): string {
  if (!section.includes("\"")) {
    return section;
  }

  return section.replace(/"([^"]+)"/gu, "$1");
}

function parseJsonDocument(raw: string | null): { [key: string]: JsonValue } | null {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as { [key: string]: JsonValue };
  } catch {
    try {
      const withoutComments = stripJsonComments(raw);
      const normalized = withoutComments.replace(/,\s*([}\]])/gu, "$1");
      return JSON.parse(normalized) as { [key: string]: JsonValue };
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

function parseMcpServersObject(input: {
  provider: ProviderId;
  rawServers: Record<string, JsonValue> | null | undefined;
  scope: "global" | "project";
  sourcePath: string;
  enabledMcpjsonServers?: Set<string>;
  disabledMcpjsonServers?: Set<string>;
}): CliMcpServerRecord[] {
  if (!input.rawServers) {
    return [];
  }

  return Object.entries(input.rawServers).flatMap(([name, rawValue]) => {
    const entry = asRecord(rawValue);
    if (!entry) {
      return [];
    }

    const command = getString(entry.command);
    const url = getString(entry.url) ?? getString(entry.server_url);
    const enabledFromAllowlist = input.enabledMcpjsonServers?.size
      ? input.enabledMcpjsonServers.has(name)
      : undefined;
    const enabled = input.disabledMcpjsonServers?.has(name)
      ? false
      : enabledFromAllowlist;

    return [
      {
        provider: input.provider,
        name,
        scope: input.scope,
        sourcePath: input.sourcePath,
        transport: normalizeTransport(
          getString(entry.transportType) ?? getString(entry.transport) ?? null,
          url,
          command
        ),
        command: command ?? undefined,
        url: url ?? undefined,
        enabled
      }
    ];
  });
}

function normalizeTransport(
  rawTransport: string | null,
  url: string | null,
  command: string | null
): CliMcpServerRecord["transport"] {
  if (rawTransport) {
    const normalized = rawTransport.toLowerCase();
    if (normalized.includes("stdio")) {
      return "stdio";
    }
    if (normalized.includes("sse")) {
      return "sse";
    }
    if (normalized.includes("http")) {
      return "http";
    }
  }

  if (command) {
    return "stdio";
  }

  if (url) {
    return inferNetworkTransport(url);
  }

  return "unknown";
}

function inferNetworkTransport(url: string): CliMcpServerRecord["transport"] {
  return /\/sse(?:\/)?$/iu.test(url) ? "sse" : "http";
}

function firstDefinedString(
  ...values: Array<string | boolean | string[] | null | undefined>
): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return null;
}

function getString(value: JsonValue | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asRecord(value: JsonValue | undefined): Record<string, JsonValue> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : null;
}

function asStringArray(value: JsonValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function firstStringArray(...values: Array<string[] | null | undefined>): string[] {
  for (const value of values) {
    if (value && value.length > 0) {
      return value;
    }
  }

  return [];
}

function dedupeMcpServers(values: CliMcpServerRecord[]): CliMcpServerRecord[] {
  const seen = new Set<string>();
  const deduped: CliMcpServerRecord[] = [];

  for (const value of values) {
    const key = [
      value.provider,
      value.name,
      value.scope,
      value.sourcePath,
      value.command ?? "",
      value.url ?? ""
    ].join("::");
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(value);
  }

  return deduped;
}
