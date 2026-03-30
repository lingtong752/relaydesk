import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type {
  CliMcpServerRecord,
  ProjectSettingsSummary,
  ProjectSettingsUpdateInput,
  ProviderSettingsRecord
} from "@shared";
import { useProjectWorkspace } from "../features/workspace/useProjectWorkspace";
import { api } from "../lib/api";

const PROVIDER_LABELS: Record<ProviderSettingsRecord["provider"], string> = {
  mock: "Mock",
  claude: "Claude",
  codex: "Codex",
  cursor: "Cursor",
  gemini: "Gemini"
};

const STATUS_LABELS: Record<ProviderSettingsRecord["status"], string> = {
  configured: "已接通",
  partial: "部分发现",
  not_found: "未发现"
};

const EDITABLE_PROVIDERS = new Set<ProviderSettingsRecord["provider"]>(["claude", "codex", "gemini"]);

interface EditableMcpServerInput {
  id: string;
  name: string;
  scope: "global" | "project";
  transport: "stdio" | "http" | "sse";
  target: string;
  enabled: boolean;
  sourcePath: string;
}

interface EditableProviderFormState {
  model: string;
  reasoningEffort: string;
  approvalPolicy: string;
  sandboxMode: string;
  allowedTools: string;
  disallowedTools: string;
  mcpServers: EditableMcpServerInput[];
}

export function ProjectSettingsOverview({
  settings,
  loading,
  error,
  fallbackRootPath,
  onSaveProvider,
  savingProvider,
  saveNotice
}: {
  settings: ProjectSettingsSummary | null;
  loading: boolean;
  error: string | null;
  fallbackRootPath: string;
  onSaveProvider(provider: "claude" | "codex" | "gemini", input: Omit<ProjectSettingsUpdateInput, "provider">): Promise<void>;
  savingProvider: "claude" | "codex" | "gemini" | null;
  saveNotice: string | null;
}): JSX.Element {
  return (
    <div className="workspace-route-stack settings-layout">
      <section className="panel settings-hero-panel">
        <div className="chat-header">
          <div>
            <div className="eyebrow">工作区设置</div>
            <h3>CLI 兼容层控制面板</h3>
            <p className="muted">{settings?.projectRootPath ?? fallbackRootPath}</p>
          </div>
          <div className="settings-hero-note">Claude / Codex / Gemini 已支持写回本地配置，Cursor 继续保持只读。</div>
        </div>

        {loading ? <p className="muted">正在读取本地 CLI 配置摘要...</p> : null}
        {error ? <div className="error-box">{error}</div> : null}
        {saveNotice ? <div className="success-box">{saveNotice}</div> : null}

        {settings ? (
          <div className="settings-summary-strip">
            <span>共发现 {settings.providers.filter((provider) => provider.status !== "not_found").length} 个已落地 provider 配置</span>
            <span>{settings.providers.reduce((count, provider) => count + provider.mcpServers.length, 0)} 个 MCP server</span>
            <span>{new Date(settings.collectedAt).toLocaleString("zh-CN", { hour12: false })} 更新</span>
          </div>
        ) : null}
      </section>

      {settings ? (
        <section className="settings-grid">
          {settings.providers.map((provider) => (
            <ProviderSettingsCard
              key={provider.provider}
              onSave={onSaveProvider}
              provider={provider}
              saving={savingProvider === provider.provider}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}

export function WorkspaceSettingsPage(): JSX.Element {
  const { projectId, projectRootPath, token } = useProjectWorkspace();
  const [settings, setSettings] = useState<ProjectSettingsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingProvider, setSavingProvider] = useState<"claude" | "codex" | "gemini" | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !projectId) {
      setLoading(false);
      setError("缺少项目上下文，暂时无法读取配置摘要。");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void api
      .getProjectSettings(token, projectId)
      .then((response) => {
        if (!cancelled) {
          setSettings(response.settings);
        }
      })
      .catch((settingsError) => {
        if (!cancelled) {
          setError(settingsError instanceof Error ? settingsError.message : "读取工作区设置失败");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, token]);

  async function handleSaveProvider(
    provider: "claude" | "codex" | "gemini",
    input: Omit<ProjectSettingsUpdateInput, "provider">
  ): Promise<void> {
    if (!token || !projectId) {
      return;
    }

    try {
      setSavingProvider(provider);
      setSaveNotice(null);
      setError(null);
      const response = await api.saveProjectProviderSettings(token, projectId, provider, input);
      setSettings(response.settings);
      setSaveNotice(`${PROVIDER_LABELS[provider]} 配置已写回本地 CLI。`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存配置失败");
    } finally {
      setSavingProvider(null);
    }
  }

  return (
    <ProjectSettingsOverview
      error={error}
      fallbackRootPath={projectRootPath}
      loading={loading}
      onSaveProvider={handleSaveProvider}
      saveNotice={saveNotice}
      savingProvider={savingProvider}
      settings={settings}
    />
  );
}

function ProviderSettingsCard({
  provider,
  saving,
  onSave
}: {
  provider: ProviderSettingsRecord;
  saving: boolean;
  onSave(provider: "claude" | "codex" | "gemini", input: Omit<ProjectSettingsUpdateInput, "provider">): Promise<void>;
}): JSX.Element {
  const editable = EDITABLE_PROVIDERS.has(provider.provider);
  const [formState, setFormState] = useState<EditableProviderFormState>(() =>
    buildFormState(provider)
  );

  useEffect(() => {
    setFormState(buildFormState(provider));
  }, [provider]);

  const serializedPayload = useMemo(
    () => serializeFormState(provider, formState),
    [provider, formState]
  );
  const isDirty = useMemo(() => {
    const baseline = JSON.stringify(serializeFormState(provider, buildFormState(provider)));
    const current = JSON.stringify(serializedPayload);
    return baseline !== current;
  }, [provider, serializedPayload]);

  async function handleSave(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!editable || !isEditableProvider(provider.provider)) {
      return;
    }

    await onSave(provider.provider, serializedPayload);
  }

  return (
    <article className="panel settings-provider-card">
      <header className="settings-provider-header">
        <div>
          <div className="eyebrow">Provider</div>
          <h4>{PROVIDER_LABELS[provider.provider]}</h4>
        </div>
        <span className={`settings-status-pill state-${provider.status}`}>{STATUS_LABELS[provider.status]}</span>
      </header>

      <p className="muted">{provider.summary}</p>

      <dl className="settings-meta-list">
        <div>
          <dt>模型</dt>
          <dd>{provider.model ?? "未读取到"}</dd>
        </div>
        <div>
          <dt>推理 / 权限</dt>
          <dd>
            {[provider.reasoningEffort, provider.toolPermissionMode].filter(Boolean).join(" · ") || "未读取到"}
          </dd>
        </div>
      </dl>

      {editable ? (
        <form className="settings-edit-form" onSubmit={(event) => void handleSave(event)}>
          <section className="settings-section-block">
            <div className="section-title-row">
              <strong>可写配置</strong>
              <span className="muted">保存后立即回读本地配置</span>
            </div>

            <label>
              模型
              <input
                onChange={(event) => setFormState((current) => ({ ...current, model: event.target.value }))}
                placeholder="例如 claude-3-7-sonnet-latest / gpt-5.4"
                value={formState.model}
              />
            </label>

            <label>
              推理
              <input
                onChange={(event) => setFormState((current) => ({ ...current, reasoningEffort: event.target.value }))}
                placeholder="例如 claude-opus-4-1 / xhigh"
                value={formState.reasoningEffort}
              />
            </label>

            {provider.provider === "codex" || provider.provider === "gemini" ? (
              <div className="settings-inline-grid">
                <label>
                  Approval Policy
                  <select
                    onChange={(event) =>
                      setFormState((current) => ({ ...current, approvalPolicy: event.target.value }))
                    }
                    value={formState.approvalPolicy}
                  >
                    <option value="">跟随默认</option>
                    <option value="untrusted">untrusted</option>
                    <option value="on-request">on-request</option>
                    <option value="never">never</option>
                  </select>
                </label>
                <label>
                  Sandbox Mode
                  <select
                    onChange={(event) =>
                      setFormState((current) => ({ ...current, sandboxMode: event.target.value }))
                    }
                    value={formState.sandboxMode}
                  >
                    <option value="">跟随默认</option>
                    <option value="read-only">read-only</option>
                    <option value="workspace-write">workspace-write</option>
                    <option value="danger-full-access">danger-full-access</option>
                  </select>
                </label>
              </div>
            ) : null}

            {provider.provider === "claude" || provider.provider === "gemini" ? (
              <div className="settings-inline-grid">
                <label>
                  允许工具
                  <input
                    onChange={(event) =>
                      setFormState((current) => ({ ...current, allowedTools: event.target.value }))
                    }
                    placeholder="例如 Bash, Edit"
                    value={formState.allowedTools}
                  />
                </label>
                <label>
                  禁止工具
                  <input
                    onChange={(event) =>
                      setFormState((current) => ({ ...current, disallowedTools: event.target.value }))
                    }
                    placeholder="例如 WebSearch"
                    value={formState.disallowedTools}
                  />
                </label>
              </div>
            ) : null}
          </section>

          <section className="settings-section-block">
            <div className="section-title-row">
              <strong>MCP</strong>
              <button
                className="secondary-button compact"
                onClick={() => setFormState((current) => ({ ...current, mcpServers: [...current.mcpServers, createEmptyMcpServer(provider)] }))}
                type="button"
              >
                新增 MCP
              </button>
            </div>

            {formState.mcpServers.length > 0 ? (
              <div className="settings-edit-mcp-list">
                {formState.mcpServers.map((server) => (
                  <div key={server.id} className="settings-edit-mcp-card">
                    <div className="settings-inline-grid">
                      <label>
                        名称
                        <input
                          onChange={(event) =>
                            updateMcpServer(server.id, setFormState, { name: event.target.value })
                          }
                          value={server.name}
                        />
                      </label>
                      <label>
                        作用域
                        <select
                          onChange={(event) =>
                            updateMcpServer(server.id, setFormState, {
                              scope: event.target.value as "global" | "project"
                            })
                          }
                          value={server.scope}
                        >
                          <option value="global">global</option>
                          <option value="project">project</option>
                        </select>
                      </label>
                    </div>

                    <div className="settings-inline-grid">
                      <label>
                        传输
                        <select
                          onChange={(event) =>
                            updateMcpServer(server.id, setFormState, {
                              transport: event.target.value as "stdio" | "http" | "sse"
                            })
                          }
                          value={server.transport}
                        >
                          <option value="stdio">stdio</option>
                          <option value="http">http</option>
                          <option value="sse">sse</option>
                        </select>
                      </label>
                      <label>
                        状态
                        <select
                          onChange={(event) =>
                            updateMcpServer(server.id, setFormState, {
                              enabled: event.target.value === "enabled"
                            })
                          }
                          value={server.enabled ? "enabled" : "disabled"}
                        >
                          <option value="enabled">enabled</option>
                          <option value="disabled">disabled</option>
                        </select>
                      </label>
                    </div>

                    <label>
                      {server.transport === "stdio" ? "命令" : "URL"}
                      <input
                        onChange={(event) =>
                          updateMcpServer(server.id, setFormState, { target: event.target.value })
                        }
                        placeholder={server.transport === "stdio" ? "例如 npx my-mcp" : "例如 http://127.0.0.1:7777/sse"}
                        value={server.target}
                      />
                    </label>

                    <div className="settings-card-actions">
                      <span className="muted">{server.sourcePath || "保存时按 provider 规则选择目标文件"}</span>
                      <button
                        className="secondary-button compact"
                        onClick={() =>
                          setFormState((current) => ({
                            ...current,
                            mcpServers: current.mcpServers.filter((item) => item.id !== server.id)
                          }))
                        }
                        type="button"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">未配置 MCP server，可直接新增后保存。</p>
            )}
          </section>

          <div className="settings-card-actions">
            <span className="muted">
              当前会写回{" "}
              {provider.provider === "claude"
                ? "Claude settings / .mcp.json"
                : provider.provider === "codex"
                  ? "Codex config.toml"
                  : "Gemini settings / antigravity mcp_config.json"}
              。
            </span>
            <button className="primary-button" disabled={!isDirty || saving} type="submit">
              {saving ? "保存中..." : "保存到本地 CLI"}
            </button>
          </div>
        </form>
      ) : (
        <section className="settings-section-block">
          <div className="info-box">
            当前 provider 仍是只读摘要。等真实 CLI 兼容层补齐后，这里会开放写回。
          </div>
        </section>
      )}

      <section className="settings-section-block">
        <div className="section-title-row">
          <strong>配置来源</strong>
          <span className="muted">{provider.sources.filter((source) => source.exists).length}/{provider.sources.length} 已发现</span>
        </div>
        <div className="settings-source-list">
          {provider.sources.map((source) => (
            <div key={`${provider.provider}-${source.path}`} className={`settings-source-item ${source.exists ? "is-present" : "is-missing"}`}>
              <div>
                <strong>{source.label}</strong>
                <p className="muted">{source.path}</p>
              </div>
              <span>{source.exists ? `${source.scope} / 已发现` : `${source.scope} / 缺失`}</span>
            </div>
          ))}
        </div>
      </section>

      {!editable ? (
        <section className="settings-section-block">
          <div className="section-title-row">
            <strong>MCP</strong>
            <span className="muted">{provider.mcpServers.length} 个</span>
          </div>
          {provider.mcpServers.length > 0 ? (
            <div className="settings-mcp-list">
              {provider.mcpServers.map((server) => (
                <div key={`${provider.provider}-${server.sourcePath}-${server.name}`} className="settings-mcp-item">
                  <div className="settings-mcp-title-row">
                    <strong>{server.name}</strong>
                    <span className="settings-transport-chip">{server.transport}</span>
                  </div>
                  <p className="muted">{server.command ?? server.url ?? server.sourcePath}</p>
                  <p className="muted">
                    {server.scope} / {server.enabled === false ? "disabled" : "enabled"}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">未发现 MCP server。</p>
          )}
        </section>
      ) : null}

      {provider.notes.length > 0 ? (
        <section className="settings-section-block">
          <div className="section-title-row">
            <strong>备注</strong>
          </div>
          <ul className="settings-note-list">
            {provider.notes.map((note) => (
              <li key={`${provider.provider}-${note}`}>{note}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}

function buildFormState(provider: ProviderSettingsRecord): EditableProviderFormState {
  return {
    model: provider.model ?? "",
    reasoningEffort: provider.reasoningEffort ?? "",
    approvalPolicy: provider.approvalPolicy ?? "",
    sandboxMode: provider.sandboxMode ?? "",
    allowedTools: provider.allowedTools.join(", "),
    disallowedTools: provider.disallowedTools.join(", "),
    mcpServers: provider.mcpServers.map((server, index) => ({
      id: `${provider.provider}-${server.name}-${index}`,
      name: server.name,
      scope: server.scope,
      transport: server.transport === "unknown" ? inferEditableTransport(server) : server.transport,
      target: server.command ?? server.url ?? "",
      enabled: server.enabled !== false,
      sourcePath: server.sourcePath
    }))
  };
}

function serializeFormState(
  provider: ProviderSettingsRecord,
  state: EditableProviderFormState
): Omit<ProjectSettingsUpdateInput, "provider"> {
  return {
    model: normalizeOptionalInput(state.model),
    reasoningEffort: normalizeOptionalInput(state.reasoningEffort),
    approvalPolicy:
      provider.provider === "codex" || provider.provider === "gemini"
        ? normalizeOptionalInput(state.approvalPolicy)
        : undefined,
    sandboxMode:
      provider.provider === "codex" || provider.provider === "gemini"
        ? normalizeOptionalInput(state.sandboxMode)
        : undefined,
    allowedTools:
      provider.provider === "claude" || provider.provider === "gemini"
        ? splitCommaSeparatedValues(state.allowedTools)
        : undefined,
    disallowedTools:
      provider.provider === "claude" || provider.provider === "gemini"
        ? splitCommaSeparatedValues(state.disallowedTools)
        : undefined,
    mcpServers: state.mcpServers
      .map((server) => toMcpServerRecord(provider, server))
      .filter((server): server is CliMcpServerRecord => Boolean(server))
  };
}

function toMcpServerRecord(
  provider: ProviderSettingsRecord,
  server: EditableMcpServerInput
): CliMcpServerRecord | null {
  const name = server.name.trim();
  const target = server.target.trim();
  if (!name || !target) {
    return null;
  }

  return {
    provider: provider.provider,
    name,
    scope: server.scope,
    sourcePath: server.sourcePath || preferredSourcePath(provider, server.scope),
    transport: server.transport,
    command: server.transport === "stdio" ? target : undefined,
    url: server.transport === "stdio" ? undefined : target,
    enabled: server.enabled
  };
}

function preferredSourcePath(
  provider: ProviderSettingsRecord,
  scope: "global" | "project"
): string {
  return (
    provider.sources.find((source) => source.scope === scope && source.exists)?.path ??
    provider.sources.find((source) => source.scope === scope)?.path ??
    ""
  );
}

function updateMcpServer(
  id: string,
  setFormState: Dispatch<SetStateAction<EditableProviderFormState>>,
  patch: Partial<EditableMcpServerInput>
): void {
  setFormState((current) => ({
    ...current,
    mcpServers: current.mcpServers.map((server) =>
      server.id === id ? { ...server, ...patch } : server
    )
  }));
}

function createEmptyMcpServer(provider: ProviderSettingsRecord): EditableMcpServerInput {
  return {
    id: `${provider.provider}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    scope: "project",
    transport: "stdio",
    target: "",
    enabled: true,
    sourcePath: preferredSourcePath(provider, "project")
  };
}

function splitCommaSeparatedValues(value: string): string[] {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

function normalizeOptionalInput(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function inferEditableTransport(
  server: CliMcpServerRecord
): "stdio" | "http" | "sse" {
  if (server.url) {
    return server.url.endsWith("/sse") ? "sse" : "http";
  }

  return "stdio";
}

function isEditableProvider(
  provider: ProviderSettingsRecord["provider"]
): provider is "claude" | "codex" | "gemini" {
  return provider === "claude" || provider === "codex" || provider === "gemini";
}
