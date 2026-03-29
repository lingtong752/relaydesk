import { useEffect, useMemo, useState } from "react";
import type {
  PluginActionExecutionRecord,
  PluginCatalogRecord,
  PluginHostContextRecord,
  PluginInstallationRecord,
  SessionRecord
} from "@shared";
import { useProjectWorkspace } from "../features/workspace/useProjectWorkspace";
import { api } from "../lib/api";
import { EmptyState } from "../shared/ui/EmptyState";
import { SectionHeader } from "../shared/ui/SectionHeader";

interface ProjectPluginsOverviewProps {
  projectId: string;
  projectRootPath: string;
  catalog: PluginCatalogRecord[];
  installations: PluginInstallationRecord[];
  selectedInstallationId: string;
  loading: boolean;
  loadingContext: boolean;
  error: string | null;
  notice: string | null;
  activeActionPluginId: string | null;
  activeActionType: "install" | "toggle" | null;
  actionDrafts: Record<string, Record<string, string>>;
  executingActionKey: string | null;
  latestExecution: PluginActionExecutionRecord | null;
  pluginContext: PluginHostContextRecord | null;
  realtimeState: string;
  selectedSession: SessionRecord | null;
  onInstall(pluginId: string): Promise<void>;
  onSelectInstallation(pluginId: string): void;
  onToggle(pluginId: string, enabled: boolean): Promise<void>;
  onActionInputChange(
    installationId: string,
    actionId: string,
    inputName: string,
    value: string
  ): void;
  onExecuteAction(installation: PluginInstallationRecord, actionId: string): Promise<void>;
}

const realtimeStateLabelMap: Record<string, string> = {
  connected: "实时连接正常",
  reconnecting: "正在恢复连接",
  connecting: "正在建立连接",
  disconnected: "实时连接已断开"
};

function getRealtimeStateLabel(state: string): string {
  return realtimeStateLabelMap[state] ?? "连接状态未知";
}

function getNextActionLabel(context: PluginHostContextRecord | null): string {
  if (!context) {
    return "先安装并打开一个插件。";
  }

  if (context.pendingApprovalCount > 0) {
    return `优先处理 ${context.pendingApprovalCount} 个待审批动作。`;
  }

  if (context.activeRun) {
    return "先回到替身 Agent 页面继续当前运行。";
  }

  if (context.latestSessions.length > 0) {
    return "继续最近会话，或者切到工具页处理代码与终端。";
  }

  return "先创建或导入一条会话，再让插件消费宿主上下文。";
}

function getActionDraftKey(installationId: string, actionId: string): string {
  return `${installationId}:${actionId}`;
}

function renderCommandPreview(installation: PluginInstallationRecord, actionId: string): string {
  const action = installation.actions.find((item) => item.id === actionId);
  if (!action) {
    return "";
  }

  const previewArgs = action.args.length > 0 ? ` ${action.args.join(" ")}` : "";
  return `${action.command}${previewArgs}`;
}

function renderPluginView(
  installation: PluginInstallationRecord,
  pluginContext: PluginHostContextRecord | null,
  realtimeState: string,
  selectedSession: SessionRecord | null
): JSX.Element {
  if (!pluginContext) {
    return <div className="muted">正在准备插件上下文...</div>;
  }

  if (installation.frontendComponent === "delivery_radar") {
    return (
      <DeliveryRadarPluginView
        pluginContext={pluginContext}
        realtimeState={realtimeState}
        selectedSession={selectedSession}
      />
    );
  }

  return (
    <ProjectPulsePluginView
      pluginContext={pluginContext}
      realtimeState={realtimeState}
      selectedSession={selectedSession}
    />
  );
}

function ProjectPulsePluginView({
  pluginContext,
  realtimeState,
  selectedSession
}: {
  pluginContext: PluginHostContextRecord;
  realtimeState: string;
  selectedSession: SessionRecord | null;
}): JSX.Element {
  return (
    <div className="plugin-runtime-stack">
      <div className="plugin-metric-grid">
        <article className="plugin-metric-card">
          <span className="plugin-metric-label">活跃 Provider</span>
          <strong>{pluginContext.activeProviders.length}</strong>
          <p>{pluginContext.activeProviders.join(" · ") || "当前还没有会话来源。"}</p>
        </article>
        <article className="plugin-metric-card">
          <span className="plugin-metric-label">会话总数</span>
          <strong>{pluginContext.sessionCount}</strong>
          <p>其中 CLI 历史 {pluginContext.importedSessionCount} 条。</p>
        </article>
        <article className="plugin-metric-card">
          <span className="plugin-metric-label">实时状态</span>
          <strong>{getRealtimeStateLabel(realtimeState)}</strong>
          <p>插件视图会跟随工作区上下文同步刷新。</p>
        </article>
      </div>

      <div className="plugin-runtime-grid">
        <section className="plugin-runtime-card">
          <div className="eyebrow">当前焦点</div>
          <h4>{selectedSession?.title ?? pluginContext.latestSessions[0]?.title ?? "还没有聚焦会话"}</h4>
          <p className="muted">
            {selectedSession
              ? `${selectedSession.provider} · ${selectedSession.origin === "imported_cli" ? "CLI 历史会话" : "RelayDesk 会话"}`
              : "当前未在宿主工作区选中会话，插件默认展示最近上下文。"}
          </p>
        </section>

        <section className="plugin-runtime-card">
          <div className="eyebrow">运行概览</div>
          <h4>{pluginContext.activeRun ? pluginContext.activeRun.objective : "当前未运行替身"}</h4>
          <p className="muted">
            {pluginContext.activeRun
              ? `状态 ${pluginContext.activeRun.status} · provider ${pluginContext.activeRun.provider}`
              : "插件页会直接消费当前项目的运行状态和最近会话。"}
          </p>
        </section>
      </div>

      <section className="plugin-runtime-card">
        <div className="section-title-row">
          <strong>最近会话</strong>
          <span className="muted">{pluginContext.latestSessions.length} 条上下文</span>
        </div>
        {pluginContext.latestSessions.length === 0 ? (
          <EmptyState message="项目里还没有会话，插件会在会话建立后自动获得宿主上下文。" />
        ) : (
          <div className="plugin-session-list">
            {pluginContext.latestSessions.map((session) => (
              <article className="plugin-session-card" key={session.id}>
                <div className="section-title-row">
                  <strong>{session.title}</strong>
                  <span className="plugin-badge">{session.provider}</span>
                </div>
                <p className="muted">
                  {session.origin === "imported_cli" ? "CLI 历史会话" : "RelayDesk 会话"} · 最近更新{" "}
                  {new Date(session.updatedAt).toLocaleString("zh-CN", { hour12: false })}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DeliveryRadarPluginView({
  pluginContext,
  realtimeState,
  selectedSession
}: {
  pluginContext: PluginHostContextRecord;
  realtimeState: string;
  selectedSession: SessionRecord | null;
}): JSX.Element {
  return (
    <div className="plugin-runtime-stack">
      <section className="plugin-runtime-card">
        <div className="section-title-row">
          <div>
            <div className="eyebrow">Delivery Radar</div>
            <h4>下一步建议</h4>
          </div>
          <span className="plugin-badge">{getRealtimeStateLabel(realtimeState)}</span>
        </div>
        <p className="muted">{getNextActionLabel(pluginContext)}</p>
      </section>

      <div className="plugin-metric-grid">
        <article className="plugin-metric-card">
          <span className="plugin-metric-label">待审批项</span>
          <strong>{pluginContext.pendingApprovalCount}</strong>
          <p>插件可以直接消费审批积压状态。</p>
        </article>
        <article className="plugin-metric-card">
          <span className="plugin-metric-label">活动运行</span>
          <strong>{pluginContext.activeRun ? pluginContext.activeRun.status : "无"}</strong>
          <p>{pluginContext.activeRun?.objective ?? "当前没有进行中的替身运行。"}</p>
        </article>
        <article className="plugin-metric-card">
          <span className="plugin-metric-label">当前会话</span>
          <strong>{selectedSession?.provider ?? pluginContext.latestSessions[0]?.provider ?? "无"}</strong>
          <p>{selectedSession?.title ?? pluginContext.latestSessions[0]?.title ?? "还没有会话上下文。"}</p>
        </article>
      </div>

      <section className="plugin-runtime-card">
        <div className="section-title-row">
          <strong>交付节奏</strong>
          <span className="muted">最新 5 条会话</span>
        </div>
        {pluginContext.latestSessions.length === 0 ? (
          <EmptyState message="暂无会话活动，Delivery Radar 会在项目开始推进后形成节奏面板。" />
        ) : (
          <div className="plugin-activity-list">
            {pluginContext.latestSessions.map((session) => (
              <article className="plugin-activity-card" key={session.id}>
                <strong>{session.title}</strong>
                <p className="muted">
                  {session.provider} · {session.origin === "imported_cli" ? "CLI 历史会话" : "RelayDesk 会话"}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PluginActionPanel({
  actionDrafts,
  executingActionKey,
  installation,
  latestExecution,
  onActionInputChange,
  onExecuteAction
}: {
  actionDrafts: Record<string, Record<string, string>>;
  executingActionKey: string | null;
  installation: PluginInstallationRecord;
  latestExecution: PluginActionExecutionRecord | null;
  onActionInputChange(
    installationId: string,
    actionId: string,
    inputName: string,
    value: string
  ): void;
  onExecuteAction(installation: PluginInstallationRecord, actionId: string): Promise<void>;
}): JSX.Element {
  if (installation.actions.length === 0) {
    return (
      <section className="plugin-runtime-card">
        <div className="section-title-row">
          <strong>插件动作</strong>
          <span className="muted">当前插件未声明本地动作。</span>
        </div>
        <EmptyState message="第一版运行时已经支持插件动作，但这个插件暂时只消费宿主上下文。" />
      </section>
    );
  }

  return (
    <section className="plugin-runtime-card">
      <div className="section-title-row">
        <div>
          <div className="eyebrow">插件动作</div>
          <h4>受控命令执行</h4>
        </div>
        <span className="muted">{installation.actions.length} 个动作</span>
      </div>
      <div className="plugin-action-list">
        {installation.actions.map((action) => {
          const actionKey = getActionDraftKey(installation.installationId, action.id);
          const actionDraft = actionDrafts[actionKey] ?? {};
          const isRunning = executingActionKey === actionKey;
          const execution =
            latestExecution?.pluginId === installation.id && latestExecution.actionId === action.id
              ? latestExecution
              : null;
          return (
            <article className="plugin-action-card" key={action.id}>
              <div className="section-title-row">
                <div>
                  <strong>{action.label}</strong>
                  <p className="muted">{action.description}</p>
                </div>
                <span className="plugin-badge">{action.permissions.join(" · ")}</span>
              </div>
              {action.inputs.length > 0 ? (
                <div className="plugin-action-form">
                  {action.inputs.map((input) => (
                    <label className="field-label" key={input.name}>
                      <span>{input.label}</span>
                      <input
                        className="text-input"
                        onChange={(event) =>
                          onActionInputChange(
                            installation.installationId,
                            action.id,
                            input.name,
                            event.target.value
                          )
                        }
                        placeholder={input.placeholder}
                        required={input.required}
                        type="text"
                        value={actionDraft[input.name] ?? input.defaultValue ?? ""}
                      />
                      {input.description ? <small className="muted">{input.description}</small> : null}
                    </label>
                  ))}
                </div>
              ) : (
                <p className="muted">这个动作不需要额外参数。</p>
              )}
              <div className="plugin-command-preview">
                <strong>命令预览</strong>
                <code>{renderCommandPreview(installation, action.id)}</code>
              </div>
              <div className="plugins-card-actions">
                <button
                  className="primary-button compact"
                  disabled={isRunning}
                  onClick={() => void onExecuteAction(installation, action.id)}
                  type="button"
                >
                  {isRunning ? "执行中..." : "执行动作"}
                </button>
                <span className="muted">
                  超时 {(action.timeoutMs ?? 15000) / 1000}s · 工作目录固定为项目根目录
                </span>
              </div>
              {execution ? (
                <div className={`plugin-execution-result ${execution.success ? "success" : "failure"}`}>
                  <div className="section-title-row">
                    <strong>最近结果</strong>
                    <span className="muted">
                      exit {execution.exitCode ?? "n/a"} · {execution.durationMs}ms
                    </span>
                  </div>
                  {execution.stdout ? (
                    <div>
                      <div className="eyebrow">stdout</div>
                      <pre>{execution.stdout}</pre>
                    </div>
                  ) : null}
                  {execution.stderr ? (
                    <div>
                      <div className="eyebrow">stderr</div>
                      <pre>{execution.stderr}</pre>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function ProjectPluginsOverview({
  projectId,
  projectRootPath,
  catalog,
  installations,
  selectedInstallationId,
  loading,
  loadingContext,
  error,
  notice,
  activeActionPluginId,
  activeActionType,
  actionDrafts,
  executingActionKey,
  latestExecution,
  pluginContext,
  realtimeState,
  selectedSession,
  onInstall,
  onSelectInstallation,
  onToggle,
  onActionInputChange,
  onExecuteAction
}: ProjectPluginsOverviewProps): JSX.Element {
  const installedPluginIds = useMemo(
    () => new Set(installations.map((installation) => installation.id)),
    [installations]
  );
  const enabledInstallations = useMemo(
    () => installations.filter((installation) => installation.enabled),
    [installations]
  );
  const selectedInstallation =
    installations.find((installation) => installation.installationId === selectedInstallationId) ?? null;

  return (
    <div className="workspace-route-stack plugins-layout">
      <section className="panel plugins-hero-panel">
        <SectionHeader
          description={projectRootPath}
          eyebrow="插件工作台"
          title="先让插件挂进工作区，再扩展更多宿主能力"
        />
        <div className="plugins-summary-strip">
          <span>已安装 {installations.length} 个插件</span>
          <span>已启用 {enabledInstallations.length} 个插件</span>
          <span>内建目录 {catalog.length} 个插件</span>
        </div>
        {loading ? <p className="muted">正在读取插件目录与安装记录...</p> : null}
        {error ? <div className="error-box">{error}</div> : null}
        {notice ? <div className="success-box">{notice}</div> : null}
      </section>

      <div className="plugins-grid">
        <section className="panel plugins-installed-panel">
          <SectionHeader
            eyebrow="已安装"
            title="项目内插件"
            description="这里管理安装记录、启停状态和当前打开的插件。"
          />
          {installations.length === 0 ? (
            <EmptyState message="当前项目还没有安装插件，先从右侧目录安装一个。" />
          ) : (
            <div className="plugins-installed-list">
              {installations.map((installation) => {
                const actionBusy = activeActionPluginId === installation.id;
                const selected = installation.installationId === selectedInstallationId;
                return (
                  <article
                    className={`plugins-installed-card ${selected ? "active" : ""}`}
                    key={installation.installationId}
                  >
                    <div className="section-title-row">
                      <div>
                        <strong>{installation.name}</strong>
                        <p className="muted">{installation.description}</p>
                      </div>
                      <span className={`plugin-status-pill ${installation.enabled ? "enabled" : "disabled"}`}>
                        {installation.enabled ? "已启用" : "已停用"}
                      </span>
                    </div>
                    <div className="plugin-badge-row">
                      <span className="plugin-badge">
                        {installation.sourceType === "local" ? "本地插件" : "内建插件"}
                      </span>
                      {installation.capabilities.map((capability) => (
                        <span className="plugin-badge" key={capability}>
                          {capability}
                        </span>
                      ))}
                    </div>
                    {installation.sourceRef ? <p className="muted">{installation.sourceRef}</p> : null}
                    <div className="plugins-card-actions">
                      <button
                        className="secondary-button compact"
                        onClick={() => onSelectInstallation(installation.installationId)}
                        type="button"
                      >
                        打开
                      </button>
                      <button
                        className="secondary-button compact"
                        disabled={actionBusy}
                        onClick={() => void onToggle(installation.id, !installation.enabled)}
                        type="button"
                      >
                        {actionBusy && activeActionType === "toggle"
                          ? "处理中..."
                          : installation.enabled
                            ? "停用"
                            : "启用"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="panel plugins-catalog-panel">
          <SectionHeader
            eyebrow="内建目录"
            title="可以立刻安装的插件"
            description={`项目 ${projectId} 当前以 built-in 目录作为第一版插件来源。`}
          />
          <div className="plugins-catalog-list">
            {catalog.map((plugin) => {
              const installed = installedPluginIds.has(plugin.id);
              const actionBusy = activeActionPluginId === plugin.id;
              return (
                <article className="plugins-catalog-card" key={plugin.id}>
                  <div className="section-title-row">
                    <div>
                      <strong>{plugin.name}</strong>
                      <p className="muted">{plugin.description}</p>
                    </div>
                    <span className="plugin-badge">v{plugin.version}</span>
                  </div>
                  <div className="plugin-badge-row">
                    <span className="plugin-badge">{plugin.sourceType === "local" ? "本地插件" : "内建插件"}</span>
                    {plugin.capabilities.map((capability) => (
                      <span className="plugin-badge" key={capability}>
                        {capability}
                      </span>
                    ))}
                  </div>
                  {plugin.sourceRef ? <p className="muted">{plugin.sourceRef}</p> : null}
                  <div className="plugins-card-actions">
                    <button
                      className="primary-button compact"
                      disabled={installed || actionBusy}
                      onClick={() => void onInstall(plugin.id)}
                      type="button"
                    >
                      {installed ? "已安装" : actionBusy && activeActionType === "install" ? "安装中..." : "安装插件"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>

      <section className="panel plugins-runtime-panel">
        <SectionHeader
          eyebrow="插件运行区"
          title={selectedInstallation ? selectedInstallation.tabTitle : "先安装并启用一个插件"}
          description={
            selectedInstallation
              ? `${selectedInstallation.name} · ${selectedInstallation.backendService === "context_snapshot" ? "已接通宿主上下文" : "无后端服务"}`
              : "第一版插件框架已支持前端 tab 和上下文快照。"
          }
        />

        {enabledInstallations.length > 1 ? (
          <div className="plugin-tab-strip" role="tablist" aria-label="插件标签页">
            {enabledInstallations.map((installation) => (
              <button
                className={
                  installation.installationId === selectedInstallationId ? "plugin-tab active" : "plugin-tab"
                }
                key={installation.installationId}
                onClick={() => onSelectInstallation(installation.installationId)}
                type="button"
              >
                <strong>{installation.tabTitle}</strong>
                <span className="muted">{installation.name}</span>
              </button>
            ))}
          </div>
        ) : null}

        {!selectedInstallation ? (
          <EmptyState message="安装任意一个插件后，这里会直接显示它消费宿主上下文后的页面。" />
        ) : !selectedInstallation.enabled ? (
          <div className="info-box">当前插件已安装但处于停用状态，启用后会重新挂载到运行区。</div>
        ) : loadingContext ? (
          <p className="muted">正在准备插件宿主上下文...</p>
        ) : (
          <>
            {renderPluginView(selectedInstallation, pluginContext, realtimeState, selectedSession)}
            <PluginActionPanel
              actionDrafts={actionDrafts}
              executingActionKey={executingActionKey}
              installation={selectedInstallation}
              latestExecution={latestExecution}
              onActionInputChange={onActionInputChange}
              onExecuteAction={onExecuteAction}
            />
          </>
        )}
      </section>
    </div>
  );
}

export function WorkspacePluginsPage(): JSX.Element {
  const { projectId, projectRootPath, realtimeState, selectedSession, token } = useProjectWorkspace();
  const [catalog, setCatalog] = useState<PluginCatalogRecord[]>([]);
  const [installations, setInstallations] = useState<PluginInstallationRecord[]>([]);
  const [selectedInstallationId, setSelectedInstallationId] = useState("");
  const [pluginContext, setPluginContext] = useState<PluginHostContextRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingContext, setLoadingContext] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeActionPluginId, setActiveActionPluginId] = useState<string | null>(null);
  const [activeActionType, setActiveActionType] = useState<"install" | "toggle" | null>(null);
  const [actionDrafts, setActionDrafts] = useState<Record<string, Record<string, string>>>({});
  const [executingActionKey, setExecutingActionKey] = useState<string | null>(null);
  const [latestExecution, setLatestExecution] = useState<PluginActionExecutionRecord | null>(null);

  const sortedInstallations = useMemo(
    () =>
      [...installations].sort(
        (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      ),
    [installations]
  );

  useEffect(() => {
    if (!token || !projectId) {
      setLoading(false);
      setError("缺少项目上下文，暂时无法读取插件信息。");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    void Promise.all([api.listPluginCatalog(token, projectId), api.listProjectPlugins(token, projectId)])
      .then(([catalogResponse, installationsResponse]) => {
        if (cancelled) {
          return;
        }

        setCatalog(catalogResponse.plugins);
        setInstallations(installationsResponse.installations);
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : "读取插件工作台失败");
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

  useEffect(() => {
    const installed = sortedInstallations.find((installation) => installation.installationId === selectedInstallationId);
    if (installed) {
      return;
    }

    setSelectedInstallationId(sortedInstallations.find((installation) => installation.enabled)?.installationId ?? sortedInstallations[0]?.installationId ?? "");
  }, [selectedInstallationId, sortedInstallations]);

  useEffect(() => {
    setLatestExecution(null);
  }, [selectedInstallationId]);

  useEffect(() => {
    if (!token || !projectId || !selectedInstallationId) {
      setPluginContext(null);
      setLoadingContext(false);
      return;
    }

    const selectedInstallation = sortedInstallations.find(
      (installation) => installation.installationId === selectedInstallationId
    );
    if (!selectedInstallation?.enabled) {
      setPluginContext(null);
      setLoadingContext(false);
      return;
    }

    let cancelled = false;
    setLoadingContext(true);
    void api
      .getProjectPluginContext(token, projectId, selectedInstallation.id)
      .then((response) => {
        if (!cancelled) {
          setPluginContext(response.context);
        }
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : "读取插件上下文失败");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingContext(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, selectedInstallationId, sortedInstallations, token]);

  async function handleInstall(pluginId: string): Promise<void> {
    if (!token || !projectId) {
      return;
    }

    try {
      setActiveActionPluginId(pluginId);
      setActiveActionType("install");
      setNotice(null);
      setError(null);
      const response = await api.installProjectPlugin(token, projectId, pluginId);
      setInstallations((current) => {
        const filtered = current.filter((installation) => installation.id !== response.installation.id);
        return [response.installation, ...filtered];
      });
      setSelectedInstallationId(response.installation.installationId);
      setNotice(`${response.installation.name} 已安装并启用。`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "安装插件失败");
    } finally {
      setActiveActionPluginId(null);
      setActiveActionType(null);
    }
  }

  async function handleToggle(pluginId: string, enabled: boolean): Promise<void> {
    if (!token || !projectId) {
      return;
    }

    try {
      setActiveActionPluginId(pluginId);
      setActiveActionType("toggle");
      setNotice(null);
      setError(null);
      const response = await api.updateProjectPluginState(token, projectId, pluginId, enabled);
      setInstallations((current) =>
        current.map((installation) =>
          installation.id === pluginId ? response.installation : installation
        )
      );
      if (!enabled && selectedInstallationId === response.installation.installationId) {
        const nextSelected = sortedInstallations.find(
          (installation) =>
            installation.installationId !== response.installation.installationId && installation.enabled
        );
        setSelectedInstallationId(nextSelected?.installationId ?? response.installation.installationId);
      }
      setNotice(`${response.installation.name} 已${enabled ? "启用" : "停用"}。`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "更新插件状态失败");
    } finally {
      setActiveActionPluginId(null);
      setActiveActionType(null);
    }
  }

  function handleActionInputChange(
    installationId: string,
    actionId: string,
    inputName: string,
    value: string
  ): void {
    const actionKey = getActionDraftKey(installationId, actionId);
    setActionDrafts((current) => ({
      ...current,
      [actionKey]: {
        ...(current[actionKey] ?? {}),
        [inputName]: value
      }
    }));
  }

  async function handleExecuteAction(
    installation: PluginInstallationRecord,
    actionId: string
  ): Promise<void> {
    if (!token || !projectId) {
      return;
    }

    const actionKey = getActionDraftKey(installation.installationId, actionId);

    try {
      setExecutingActionKey(actionKey);
      setError(null);
      setNotice(null);
      const response = await api.executeProjectPluginAction(token, projectId, installation.id, actionId, {
        inputs: actionDrafts[actionKey] ?? {}
      });
      setLatestExecution(response.execution);
      setNotice(`${installation.name} 已执行动作 ${actionId}。`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "执行插件动作失败");
    } finally {
      setExecutingActionKey(null);
    }
  }

  return (
    <ProjectPluginsOverview
      activeActionPluginId={activeActionPluginId}
      activeActionType={activeActionType}
      actionDrafts={actionDrafts}
      catalog={catalog}
      executingActionKey={executingActionKey}
      error={error}
      installations={sortedInstallations}
      latestExecution={latestExecution}
      loading={loading}
      loadingContext={loadingContext}
      notice={notice}
      onActionInputChange={handleActionInputChange}
      onExecuteAction={handleExecuteAction}
      onInstall={handleInstall}
      onSelectInstallation={setSelectedInstallationId}
      onToggle={handleToggle}
      pluginContext={pluginContext}
      projectId={projectId}
      projectRootPath={projectRootPath}
      realtimeState={realtimeState}
      selectedInstallationId={selectedInstallationId}
      selectedSession={selectedSession}
    />
  );
}
